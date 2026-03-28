"""
redis_client.py — Single shared async Redis connection.

WHY A GLOBAL INSTEAD OF FastAPI's Depends() INJECTION:
python-socketio event handlers are plain async functions — they have no
access to FastAPI's dependency injection system. A module-level global
is the correct solution, not a workaround.

WHY r IS CREATED AT MODULE IMPORT TIME (not in lifespan):
The original approach used init_redis() inside FastAPI's lifespan.
The problem: uvicorn runs socket_app (the ASGIApp wrapper), not app
directly. FastAPI's lifespan events don't fire reliably through the
wrapper, leaving r as None at runtime.

redis.from_url() is lazy — it builds a connection pool config but does
NOT open any socket until the first command is awaited. Creating it at
import time is safe because no I/O happens here. The actual connection
opens on the first Redis call inside an async context, which is always
after uvicorn's event loop is running.

WHY decode_responses=True:
Without it every value comes back as bytes: b"waiting" instead of
"waiting". Setting this on the client means Redis always returns plain
strings — no .decode() calls needed anywhere.
"""

import redis.asyncio as aioredis
from config import REDIS_URL

# Created at import time — safe because from_url() is lazy (no I/O here).
# The connection opens on first use inside an async context.
r: aioredis.Redis = aioredis.from_url(REDIS_URL, decode_responses=True)


async def close_redis():
    await r.aclose()
