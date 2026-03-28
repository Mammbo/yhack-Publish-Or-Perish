"""
redis_client.py — Single shared async Redis connection.
"""

import redis.asyncio as aioredis
from config import REDIS_URL

# Created at import time — safe because from_url() is lazy (no I/O here).
# The connection opens on first use inside an async context.
r: aioredis.Redis = aioredis.from_url(REDIS_URL, decode_responses=True)


async def close_redis():
    await r.aclose()
