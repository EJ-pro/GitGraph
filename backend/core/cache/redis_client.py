import os
import json
import logging
import redis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

_client: redis.Redis | None = None


def get_redis() -> redis.Redis | None:
    """Singleton Redis client. Returns None if Redis is unreachable (fail-open)."""
    global _client
    if _client is not None:
        return _client
    try:
        _client = redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)
        _client.ping()
        logger.info("[Redis] Connected to %s", REDIS_URL)
    except Exception as e:
        logger.warning("[Redis] Unavailable — caching disabled: %s", e)
        _client = None
    return _client


def cache_get(key: str):
    """Get a JSON-serialised value. Returns None on miss or error."""
    r = get_redis()
    if r is None:
        return None
    try:
        raw = r.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as e:
        logger.warning("[Redis] get(%s) failed: %s", key, e)
        return None


def cache_set(key: str, value, ttl: int = 60) -> None:
    """Set a JSON-serialised value with TTL (seconds)."""
    r = get_redis()
    if r is None:
        return
    try:
        r.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception as e:
        logger.warning("[Redis] set(%s) failed: %s", key, e)


def cache_delete(key: str) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        r.delete(key)
    except Exception as e:
        logger.warning("[Redis] delete(%s) failed: %s", key, e)


def cache_delete_pattern(pattern: str) -> None:
    """Delete all keys matching a glob pattern (e.g. 'projects:user:42:*')."""
    r = get_redis()
    if r is None:
        return
    try:
        keys = r.keys(pattern)
        if keys:
            r.delete(*keys)
    except Exception as e:
        logger.warning("[Redis] delete_pattern(%s) failed: %s", pattern, e)
