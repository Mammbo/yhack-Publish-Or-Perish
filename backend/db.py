"""
db.py — MongoDB connection and collection handles.

WHY MOTOR AND NOT pymongo:
pymongo is synchronous. Calling it from an async FastAPI route blocks the
entire event loop until the DB query returns — during that time no socket
events can be processed and no other requests can be served. Motor is the
official async wrapper around pymongo; same API, non-blocking.

WHY PERSON 1 EVEN HAS A db.py:
Person 1 doesn't own MongoDB — Person 4 does. But Person 1's game_over
logic needs to write the winner and ended_at timestamp to game_sessions.
Rather than Person 4 needing to expose a separate HTTP endpoint just for
that write, Person 1 imports the collection directly. Both are in the
same FastAPI process so this is a legitimate shared module, not a hack.

WHY COLLECTIONS ARE None WHEN MONGODB_URI IS MISSING:
Person 1 needs to run and test the state machine locally without a MongoDB
connection. Making the collections None lets Person 1 guard writes with
`if sessions_col` and skip them in local dev. The alternative — requiring
MongoDB to be set up locally just to test socket events — would waste time.
In production on Railway, MONGODB_URI will always be set so this is fine.
"""

import motor.motor_asyncio
from config import MONGODB_URI

# None if MONGODB_URI not set — callers must guard with `if col is not None`
client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URI) if MONGODB_URI else None
db = client["publish_or_perish"] if client else None

players_col  = db["players"]       if db is not None else None
sessions_col = db["game_sessions"] if db is not None else None
files_col    = db["uploaded_files"] if db is not None else None
