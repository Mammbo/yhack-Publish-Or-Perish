# yhack-Publish-Or-Perish
an AI-powered multiplayer study game where one player is secretly the impostor. Upload your notes, let AI generate the challenge, and expose the fraud before they bring the whole group down.

Publish or Perish — Technical Spec & Task Split
Why Each Tech Choice
Next.js 14 + TypeScript — we need SSR for the lobby/room pages so room state loads fast, and the app router gives us clean page separation between lobby, game, and results. TypeScript prevents runtime type bugs in the WebSocket event handling which will be the most error-prone part.
Tailwind CSS — no separate CSS files, no class naming, just inline utilities. Fastest possible styling in a hackathon. CSS animations via animate- classes replace Framer entirely.
Socket.io — more reliable than raw WebSockets for a hackathon. Built-in room namespacing maps perfectly to our game rooms, automatic reconnection handles dropped connections, and the client/server API is dead simple. Raw WebSockets would require us to implement all of this manually.
FastAPI — async by default which matters for handling concurrent WebSocket connections across multiple game rooms simultaneously. Python keeps us in the same ecosystem as our AI libraries and file parsing tools. Flask would block, Node would require rewriting ingestion in JS.
Redis — game state needs to be ephemeral, fast, and shared across potentially multiple FastAPI workers. Redis TTL keys handle our game timers natively. Postgres is too slow and too persistent for turn-by-turn game state that should evaporate when a game ends.
Supabase — gives us Postgres + file storage + auth in one dashboard with zero DevOps. At a hackathon we are not setting up our own Postgres instance.
Celery + Redis — file ingestion + AI calls can take 10-30 seconds. Without a task queue this blocks the main FastAPI thread and the WebSocket server dies. Celery pushes processing to background workers and pings the frontend when ready.
Gemini 2.5 Pro — native web search grounding via Google's API means we don't need to integrate a separate search API like Tavily or Serper. Also natively multimodal so it can read images embedded in uploaded PDFs and slides without extra preprocessing. Best-in-class long context for ingesting dense notes.
K2 Thinking (MBZUAI) — the thinking/reasoning variant is specifically justified here because game balance is a reasoning problem, not a generation problem. Deciding what makes a subtle bug vs an obvious one, decomposing a math problem into fair sequential steps, or picking two words that are close enough to fool players but distinct enough to be winnable — these require deliberation. A fast generation model gets this wrong and the game breaks.

Task Split — 4 People, 24 Hours

Person 1 — Backend & Real-Time Infrastructure
Own: FastAPI server, Socket.io room management, Redis game state, Celery task queue
Hours 0–4: Foundation

Scaffold FastAPI project with python-socketio mounted
Connect Redis (Railway instance)
Implement room creation and join logic:

POST /room/create → generates 6-digit room code, stores in Redis
POST /room/join → validates code, adds player to room


Define Redis schema:

room:{code}:state      → waiting | ingesting | playing | voting | ended
room:{code}:players    → list of playerIDs
room:{code}:impostor   → playerID
room:{code}:gameMode   → coding | stem | conceptual
room:{code}:content    → serialized game JSON
room:{code}:turn       → current playerID
room:{code}:votes      → hash of playerID → votedForID
room:{code}:timer      → TTL key
Hours 4–10: WebSocket Event System

Implement all Socket.io events:

Inbound:
  join_room, upload_complete, submit_task,
  call_meeting, cast_vote, submit_answer, submit_description

Outbound:
  player_joined, game_start, turn_update,
  meeting_called, vote_result, elimination, game_over

Implement turn rotation logic per game mode
Implement voting: tally votes, resolve majority, emit result
Implement timer: Redis TTL key, background thread pings frontend on expiry

Hours 10–16: Game State Machine

Build a state machine that advances room state:

waiting → ingesting → playing → voting → playing → ended

Handle edge cases: player disconnect mid-game, vote ties, last player standing

Hours 16–24: Integration + Debugging

Connect with Person 2's AI output format into Redis
Connect with Person 3's frontend socket events
Stress test multiple concurrent rooms


Person 2 — AI Pipeline & File Ingestion
Own: File parsing, chunking, Gemini 2.5 Pro integration, K2 Thinking integration, Celery tasks
Hours 0–4: Ingestion Pipeline

Set up Celery worker connected to Redis broker
Build file extraction per type:

python# PDF
import fitz  # PyMuPDF
doc = fitz.open(filepath)
text = "\n".join([page.get_text() for page in doc])

# PPTX
from pptx import Presentation
prs = Presentation(filepath)
text = "\n".join([shape.text for slide in prs.slides 
                  for shape in slide.shapes if shape.has_text_frame])

# APKG (Anki) — it's a zip containing a SQLite db
import zipfile, sqlite3
with zipfile.ZipFile(filepath) as z:
    z.extract("collection.anki2", "/tmp/")
conn = sqlite3.connect("/tmp/collection.anki2")
notes = conn.execute("SELECT flds FROM notes").fetchall()

# DOCX
from docx import Document
doc = Document(filepath)
text = "\n".join([p.text for p in doc.paragraphs])

Chunk extracted text: 500 token chunks, 50 token overlap, tagged with source

Hours 4–10: Gemini Integration

Call Gemini 2.5 Pro with web search grounding enabled:

pythonimport google.generativeai as genai

model = genai.GenerativeModel("gemini-2.5-pro")
# Enable grounding/web search tool
response = model.generate_content(
    contents=prompt,
    tools=[{"google_search_retrieval": {}}]
)

Gemini's job: enrich the chunked notes with web context, then generate raw game content (code file, problem set, or word pairs) based on subject
Define strict output JSON schema that Gemini must return:

json{
  "subject_type": "coding | stem | conceptual",
  "game_content": { ... },
  "web_sources": [ ... ]
}
Hours 10–16: K2 Thinking Integration

Call MBZUAI K2 API with Gemini's output as input:

pythonimport requests

response = requests.post(
    "https://api.mbzuai.ac.ae/v1/chat/completions",  # confirm exact endpoint
    headers={"Authorization": f"Bearer {K2_API_KEY}"},
    json={
        "model": "k2-thinking",
        "messages": [{"role": "user", "content": reasoning_prompt}]
    }
)

K2's job: take Gemini's raw content and reason through:

Which tasks to assign which players
What the impostor's sabotage should be (subtle, not obvious)
Step decomposition validity for STEM mode
Word pair fairness for Conceptual mode


Output a finalized game payload that gets written to Redis by Person 1's backend

Hours 16–24: Prompt Engineering + Edge Cases

Iterate on prompts based on garbage outputs (there will be garbage outputs)
Handle API failures gracefully with fallback content
Test ingestion on real PDFs, Anki decks, and lecture slides


Person 3 — Frontend & Game UI
Own: Next.js app, all pages, Socket.io client, game UI per mode
Hours 0–4: App Scaffold + Lobby

Init Next.js 14 + TypeScript + Tailwind + Shadcn/ui
Build pages:

/ — landing page, create or join room
/room/[code] — lobby waiting room, shows connected players
/game/[code] — main game view (renders different UI per game mode)
/results/[code] — end screen


Connect Socket.io client:

typescriptimport { io } from "socket.io-client"
const socket = io(process.env.NEXT_PUBLIC_API_URL)
socket.emit("join_room", { roomCode, playerName })
socket.on("player_joined", (data) => setPlayers(data.players))
Hours 4–10: Game Mode UIs
Coding mode:

Split pane: code editor (use CodeMirror — lightweight, no Monaco overhead) on left, task list on right
Highlight assigned task in editor
Submit button sends diff to backend

STEM mode:

Show previous player's answer clearly
Large input area for current step
Submit + confirm flow to prevent accidental sends

Conceptual mode:

Round 1: show each player's word submission as it comes in via socket event, turn indicator
Round 2: simultaneous input, countdown timer visible, no peeking at others

Hours 10–16: Voting & Meeting UI

Emergency meeting modal (full screen takeover)
Player cards with vote buttons
Live vote tally updating via socket
Reveal animation (pure CSS, no Framer) — flip card showing impostor

Hours 16–24: Polish + Integration

Connect all socket events to UI state
Loading states for AI processing (upload → generating game)
Error handling for disconnects
Mobile responsiveness if time allows


Person 4 — DevOps, Auth, Upload Flow & Integration
Own: Supabase setup, file upload endpoint, Vercel + Railway deployment, GoDaddy DNS, integration glue
Hours 0–4: Infrastructure Setup

Spin up Supabase project: enable Storage, create tables:

sqlCREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  game_mode TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

CREATE TABLE uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id),
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

Deploy FastAPI to Railway, connect Redis add-on
Deploy Next.js to Vercel, set environment variables

Hours 4–10: File Upload Flow

Build POST /upload endpoint in FastAPI:

python@app.post("/upload")
async def upload_files(
    room_code: str,
    files: List[UploadFile] = File(...)
):
    for file in files:
        # validate file type
        # upload to Supabase Storage
        # log to uploaded_files table
        # trigger Celery ingestion task
    return {"status": "processing"}
```
- Build upload UI component (drag and drop, multi-file, progress bar) and hand to Person 3
- Accepted types: `.pdf .pptx .docx .md .txt .apkg`
- File size limit: 25MB per file

**Hours 10–16: GoDaddy DNS + Deployment Pipeline**
- Point `publishorperish.com` → Vercel
- Point `api.publishorperish.com` → Railway
- Set up environment variables across all services:
```
NEXT_PUBLIC_API_URL=https://api.publishorperish.com
SUPABASE_URL=...
SUPABASE_KEY=...
REDIS_URL=...
GEMINI_API_KEY=...
K2_API_KEY=...

Set up GitHub repo, make sure all four people can push and deploy

Hours 16–24: End-to-End Testing & Integration

Run full game flow end to end across all three modes
Find and fix integration bugs between frontend/backend/AI
Make sure uploads work on prod (not just localhost)
Prepare demo flow for judging — know exactly what you're clicking and in what order


Critical Path
The one thing that breaks everything if it's late:

WebSocket state machine (Person 1) must be functional by Hour 10 so Person 3 can build UI against real events and Person 2 can test AI output flowing into actual game state. If this slips, everyone blocks.