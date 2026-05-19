import time
import logging
from .redis_client import get_redis

logger = logging.getLogger(__name__)

# endpoint → {tier: (max_requests, window_seconds)}
_LIMITS: dict[str, dict[str, tuple[int, int]]] = {
    "analyze": {
        "free": (3, 60),    # 분당 3회
        "pro":  (10, 60),   # 분당 10회
    },
    "chat": {
        "free": (20, 60),   # 분당 20회
        "pro":  (60, 60),   # 분당 60회
    },
}


def check_rate_limit(user_id: int, endpoint: str, tier: str = "free") -> tuple[bool, int]:
    """
    Tier별 fixed-window rate limiter backed by Redis.

    Returns:
        (allowed, retry_after_seconds)
    Redis 장애 시 fail-open (차단하지 않음).
    """
    endpoint_limits = _LIMITS.get(endpoint)
    if not endpoint_limits:
        return True, 0

    # 알 수 없는 tier는 free로 처리
    limit, window = endpoint_limits.get(tier, endpoint_limits["free"])
    window_id = int(time.time()) // window
    key = f"rate:{endpoint}:{tier}:{user_id}:{window_id}"

    r = get_redis()
    if r is None:
        return True, 0

    try:
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window)
        count, _ = pipe.execute()

        if count > limit:
            ttl = r.ttl(key)
            return False, max(ttl, 1)
        return True, 0
    except Exception as e:
        logger.warning("[RateLimit] Redis error — allowing request: %s", e)
        return True, 0
