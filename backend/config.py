"""
config.py — enviornment variable loading
"""

import os
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.environ["REDIS_URL"]  # Hard fail — server is useless without Redis
MONGODB_URI = os.environ.get("MONGODB_URI", "")  # Soft — Person 1 can dev without it
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
