# Person 4 — DevOps, Upload Flow & Integration

**Own:** MongoDB setup, file upload endpoint, Vercel + Railway deployment, DNS, integration glue

**Your job:** Make sure everything runs somewhere real and that files get from the browser to Person 2's Celery task without falling over. You're also the one who runs end-to-end tests and fixes integration bugs in the last stretch.

---

## How Your Piece Fits

```
Browser          → POST /upload (you) → temp file storage → trigger Person 2's Celery task
MongoDB (you)    → stores persistent records: players, game sessions, file metadata
Redis (Person 1) → stores live game state (you provision it on Railway)
Vercel (you)     → hosts Person 3's Next.js frontend
Railway (you)    → hosts Person 1's FastAPI backend + Redis + MongoDB
```

---

## Stack

| Tech | Role | Docs |
|---|---|---|
| MongoDB | Persistent storage for players, sessions, file metadata | https://www.mongodb.com/docs/manual/ |
| Motor | Async MongoDB Python driver used in FastAPI | https://motor.readthedocs.io/en/stable/ |
| MongoDB Atlas | Hosted MongoDB — free tier is fine for a hackathon | https://www.mongodb.com/docs/atlas/ |
| FastAPI | You add the `/upload` endpoint here | https://fastapi.tiangolo.com/ |
| Railway | Hosts FastAPI + Redis | https://docs.railway.com/ |
| Vercel | Hosts Next.js frontend | https://vercel.com/docs |

---

## Hours 0–4: Infrastructure Setup

### 1. MongoDB Atlas

Spin up a free cluster on Atlas. No Railway-hosted MongoDB needed — Atlas free tier is plenty for a hackathon.

**Atlas quickstart:** https://www.mongodb.com/docs/atlas/getting-started/

1. Create account at cloud.mongodb.com
2. Create a free M0 cluster
3. Add a database user + password
4. Whitelist `0.0.0.0/0` (allow all IPs — fine for hackathon)
5. Get your connection string: `mongodb+srv://<user>:<pass>@cluster0.xxx.mongodb.net/`

### 2. MongoDB Collections

**Motor async driver docs:** https://motor.readthedocs.io/en/stable/tutorial-asyncio.html
**MongoDB data modeling:** https://www.mongodb.com/docs/manual/data-modeling/

```python
# db.py
import motor.motor_asyncio
import os

client = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGODB_URI"])
db = client["publish_or_perish"]

players_col = db["players"]
sessions_col = db["game_sessions"]
files_col = db["uploaded_files"]
```

Collections and their document shapes:

```python
# players collection
{
    "_id": ObjectId,
    "player_id": str,       # matches Redis playerID
    "name": str,
    "created_at": datetime
}

# game_sessions collection
{
    "_id": ObjectId,
    "room_code": str,
    "subject": str,          # filled in when AI pipeline completes
    "winner": str,           # "players" or "impostor" — filled on game_over
    "created_at": datetime,
    "ended_at": datetime     # filled on game_over
}

# uploaded_files collection
{
    "_id": ObjectId,
    "room_code": str,
    "file_name": str,
    "file_type": str,
    "temp_path": str,        # path on Railway filesystem
    "uploaded_at": datetime
}
```

### 3. Deploy FastAPI to Railway

**Railway quickstart:** https://docs.railway.com/quick-start

1. Push backend code to GitHub
2. New Railway project → Deploy from GitHub repo
3. Add Redis add-on: New → Database → Redis
4. Set environment variables in Railway dashboard:

```
MONGODB_URI=mongodb+srv://...
REDIS_URL=<auto-injected by Railway Redis add-on>
GEMINI_API_KEY=...
K2_API_KEY=...
BACKEND_URL=https://your-app.up.railway.app
```

### 4. Deploy Next.js to Vercel

**Vercel deployment docs:** https://vercel.com/docs/deployments/overview

1. Push frontend code to GitHub
2. New Vercel project → Import from GitHub
3. Set environment variables:

```
NEXT_PUBLIC_API_URL=https://your-app.up.railway.app
```

---

## Hours 4–10: File Upload Flow

### Upload Endpoint

Add this to Person 1's FastAPI server. It receives files, saves them temporarily, logs to MongoDB, and kicks off Person 2's Celery task.

**FastAPI file uploads docs:** https://fastapi.tiangolo.com/tutorial/request-files/

```python
import os, shutil, uuid
from fastapi import UploadFile, File
from typing import List
from datetime import datetime

ALLOWED_TYPES = {"pdf", "pptx", "docx", "md", "txt", "apkg"}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB

@app.post("/upload")
async def upload_files(
    room_code: str,
    files: List[UploadFile] = File(...)
):
    state = await r.get(f"room:{room_code}:state")
    if not state:
        raise HTTPException(status_code=404, detail="Room not found")

    saved_files = []
    for file in files:
        # Validate file type
        ext = file.filename.split(".")[-1].lower()
        if ext not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

        # Save to temp directory on Railway filesystem
        temp_path = f"/tmp/{uuid.uuid4()}_{file.filename}"
        content = await file.read()

        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"{file.filename} exceeds 25MB limit")

        with open(temp_path, "wb") as f:
            f.write(content)

        # Log to MongoDB
        await files_col.insert_one({
            "room_code": room_code,
            "file_name": file.filename,
            "file_type": ext,
            "temp_path": temp_path,
            "uploaded_at": datetime.utcnow()
        })

        saved_files.append({"path": temp_path, "type": ext, "name": file.filename})

    # Create game session record in MongoDB
    await sessions_col.insert_one({
        "room_code": room_code,
        "created_at": datetime.utcnow(),
        "winner": None,
        "ended_at": None
    })

    # Trigger Person 2's Celery task
    from tasks import process_files_and_generate_game
    process_files_and_generate_game.delay(room_code, saved_files)

    # Notify all players in the room that upload is complete
    await sio.emit("upload_complete", {"room_code": room_code}, room=room_code)

    return {"status": "processing"}
```

### Game-Failed Endpoint

Person 2 calls this if the AI pipeline errors out.

```python
@app.post("/room/game-failed")
async def game_failed(room_code: str):
    await r.set(f"room:{room_code}:state", "waiting")
    await sio.emit("error", {"message": "AI pipeline failed. Please try uploading again."}, room=room_code)
    return {"status": "reset"}
```

### Update MongoDB on Game Over

Wire this into Person 1's `game_over` emit logic so the session record gets closed out:

```python
# Add to tally_votes() in Person 1's code after emitting game_over
await sessions_col.update_one(
    {"room_code": room_code},
    {"$set": {"winner": winner, "ended_at": datetime.utcnow()}}
)
```

---

## Hours 10–16: DNS + Deployment Pipeline

### GoDaddy DNS

**Vercel custom domain docs:** https://vercel.com/docs/projects/domains/add-a-domain
**Railway custom domain docs:** https://docs.railway.com/deploy/exposing-your-app

Point `publishorperish.com` to Vercel:
- In GoDaddy: add CNAME record `www` → `cname.vercel-dns.com`
- In Vercel: add domain `publishorperish.com` in project settings

Point `api.publishorperish.com` to Railway:
- In GoDaddy: add CNAME record `api` → your Railway app's generated domain
- In Railway: add custom domain `api.publishorperish.com` in service settings

### Environment Variables Checklist

Make sure all four services have what they need:

**Railway (FastAPI backend):**
```
MONGODB_URI=mongodb+srv://...
REDIS_URL=<auto-injected>
GEMINI_API_KEY=...
K2_API_KEY=...
BACKEND_URL=https://api.publishorperish.com
```

**Vercel (Next.js frontend):**
```
NEXT_PUBLIC_API_URL=https://api.publishorperish.com
```

**Celery worker (same Railway service or separate):**
```
REDIS_URL=<same as backend>
GEMINI_API_KEY=...
K2_API_KEY=...
BACKEND_URL=https://api.publishorperish.com
```

### GitHub Repo

Set up the repo so everyone can push without stepping on each other:

```
/
  backend/        ← Person 1 + Person 2 + you (upload endpoint)
  frontend/       ← Person 3
```

One Railway project deploys `backend/`, one Vercel project deploys `frontend/`. Both auto-deploy on push to `main`.

---

## Hours 16–24: End-to-End Testing

Run through the full game flow. Catch integration bugs before the demo.

### Checklist

```
[ ] Create room from landing page → get 6-digit code
[ ] Second browser joins with code → both see each other in lobby
[ ] Host uploads a PDF → upload completes, spinner shows
[ ] AI pipeline finishes → game_start fires, problem appears on both screens
[ ] Impostor banner appears on one screen only
[ ] Player 1 submits contribution → appears on Player 2's screen
[ ] Turn rotates correctly
[ ] Call meeting → voting modal appears on both screens
[ ] Both players vote → vote_result fires, results screen shows
[ ] Impostor directive revealed on results screen
[ ] MongoDB session record has ended_at set
```

### Common Integration Bugs

| Symptom | Likely cause |
|---|---|
| Socket events not reaching frontend | `NEXT_PUBLIC_API_URL` points to wrong URL or missing in Vercel env vars |
| Upload returns 404 | `room_code` doesn't exist in Redis — create room first |
| Celery task never fires | Worker not running — check Railway logs for the worker process |
| `game_start` never fires | Person 2's task failed silently — check Celery worker logs |
| CORS error in browser | FastAPI `cors_allowed_origins` doesn't include Vercel domain |

### CORS Fix

Make sure Person 1's FastAPI server allows your Vercel domain:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://publishorperish.com",
        "https://www.publishorperish.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**FastAPI CORS docs:** https://fastapi.tiangolo.com/tutorial/cors/

---

## Demo Flow

Know this cold before judging:

1. Open `publishorperish.com` on two devices (or two browser windows)
2. Device 1: Create room → get code
3. Device 2: Join with code
4. Device 1: Upload a PDF (have one ready — your own lecture notes work great)
5. Wait ~15 seconds for AI
6. Show the impostor banner on one screen (cover the other screen)
7. Play through 2–3 contributions
8. Call a meeting, vote, reveal
9. Show the results screen with the directive

---

## Project Setup

```bash
# Backend dependencies
pip install fastapi uvicorn python-socketio "redis[asyncio]" motor celery python-dotenv python-multipart

# .env
MONGODB_URI=mongodb+srv://...
REDIS_URL=redis://...
GEMINI_API_KEY=...
K2_API_KEY=...
BACKEND_URL=http://localhost:8000
```

**Motor (async MongoDB) docs:** https://motor.readthedocs.io/en/stable/
**MongoDB Atlas free tier:** https://www.mongodb.com/pricing
**Railway environment variables:** https://docs.railway.com/develop/variables
**Vercel environment variables:** https://vercel.com/docs/projects/environment-variables
