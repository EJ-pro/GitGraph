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
    Tier별 sliding-window rate limiter backed by Redis sorted set.

    Returns:
        (allowed, retry_after_seconds)
    Redis 장애 시 fail-open (차단하지 않음).
    """
    endpoint_limits = _LIMITS.get(endpoint)
    if not endpoint_limits:
        return True, 0

    limit, window = endpoint_limits.get(tier, endpoint_limits["free"])
    key = f"swrl:{endpoint}:{tier}:{user_id}"
    now = time.time()
    window_start = now - window

    r = get_redis()
    if r is None:
        return True, 0

    try:
        pipe = r.pipeline()
        # 윈도우 밖 오래된 항목 제거
        pipe.zremrangebyscore(key, 0, window_start)
        # 현재 요청 추가 (score=타임스탬프, member=유니크 값)
        pipe.zadd(key, {str(now): now})
        # 윈도우 내 총 요청 수
        pipe.zcard(key)
        # TTL 갱신
        pipe.expire(key, window)
        _, _, count, _ = pipe.execute()

        if count > limit:
            # 가장 오래된 항목이 만료되는 시점까지 대기
            oldest = r.zrange(key, 0, 0, withscores=True)
            retry_after = int(window - (now - oldest[0][1])) + 1 if oldest else window
            return False, max(retry_after, 1)
        return True, 0
    except Exception as e:
        logger.warning("[RateLimit] Redis error — allowing request: %s", e)
        return True, 0
