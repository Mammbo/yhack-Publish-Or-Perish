"""
config.py — Central environment variable loading.

WHY THIS FILE EXISTS AT ALL:
Every other module needs env vars. Without a central place to load them,
you'd call load_dotenv() in multiple files and risk subtle ordering bugs
where one module loads before .env is read. One import of config.py
guarantees .env is loaded exactly once, at startup.

WHY dotenv AND NOT pydantic-settings:
pydantic-settings is the "correct" production approach — it validates types,
gives you IDE autocomplete, and raises clear errors on missing vars.
Counter-argument: for a 24-hour hackathon with 4 people, adding a dependency
that requires a BaseSettings class and field annotations is overhead that
doesn't pay off. dotenv + os.environ is 3 lines and everyone on the team
already understands it. Ship speed > correctness here.

WHY os.environ["REDIS_URL"] (hard crash) BUT os.environ.get("MONGODB_URI"):
Redis is Person 1's core dependency — if REDIS_URL is missing the entire
server is broken and we WANT a loud crash at startup, not a silent failure
at runtime when the first Redis call is made.
MongoDB is used by Person 4's upload endpoint and Person 1 only writes
to it on game_over. If MONGODB_URI isn't set locally during development,
Person 1 can still run and test the state machine without it.
"""

import os
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.environ["REDIS_URL"]  # Hard fail — server is useless without Redis
MONGODB_URI = os.environ.get("MONGODB_URI", "")  # Soft — Person 1 can dev without it
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
