# Publish or Perish

An AI-powered multiplayer study game (max 4 players) where one player is secretly the impostor. Upload your notes, let AI generate the challenge, and expose the fraud before they bring the whole group down.

---

## How It Works

1. Host creates a room → shares 6-digit code with up to 3 others
2. Host uploads study material (any file type)
3. AI reads the files, searches the web for context, and generates a collaborative problem
4. One player is secretly assigned as impostor — they receive a **hidden wrong directive** (wrong constraint, wrong objective, wrong fact) instead of the real one
5. All players collaborate on the same problem, contributing turns
6. Players call meetings, discuss suspicions, and vote to eliminate who they think is sabotaging
7. Impostor wins if they're not caught. Players win if they vote them out.

---

## Game Mode — Collaborative

Everyone works on the same problem simultaneously. All contributions are visible to everyone. The impostor's hidden directive causes their contributions to be subtly off — plausible enough to not be immediately obvious, wrong enough to matter.

**Subject-agnostic by design.** The AI adapts the sabotage to the material:

| Subject | What players do | Impostor's hidden directive |
|---|---|---|
| Coding | Build a function together, each player adds a block | Make it silently fail a specific edge case |
| Math / Physics | Solve a multi-step problem collaboratively | Use a plausible but wrong formula or value |
| Biology / Chem | Explain a process or reaction step by step | Swap a term, reverse a direction, wrong product |
| History | Build a collaborative argument or timeline | Introduce a confident-sounding wrong fact |
| Literature | Construct a textual analysis together | Push a subtly misread interpretation |

The impostor is not told to "be wrong." They are given a **different objective**. Their contributions are internally consistent — just for the wrong problem.

---

## Why Each Tech Choice

**Next.js 14 + TypeScript** — SSR for lobby/room pages so room state loads fast. App router gives clean page separation between lobby, game, and results. TypeScript prevents runtime type bugs in WebSocket event handling, which is the most error-prone part.

**Tailwind CSS** — No separate CSS files, no class naming, just inline utilities. Fastest possible styling in a hackathon. CSS animations via `animate-` classes replace Framer entirely.

**Socket.io** — More reliable than raw WebSockets for a hackathon. Built-in room namespacing maps perfectly to game rooms, automatic reconnection handles dropped connections. Raw WebSockets would require implementing all of this manually.

**FastAPI** — Async by default, which matters for handling concurrent WebSocket connections across multiple game rooms simultaneously. Python keeps us in the same ecosystem as our AI libraries and file parsing tools.

**Redis** — Game state needs to be ephemeral, fast, and shared across potentially multiple FastAPI workers. Redis TTL keys handle game timers natively. State should evaporate when a game ends — Redis is the right tool.

**Supabase** — Postgres + file storage + auth in one dashboard with zero DevOps. We are not setting up our own Postgres instance at a hackathon.

**Celery + Redis** — File ingestion + AI calls take 10–30 seconds. Without a task queue this blocks the main FastAPI thread and the WebSocket server dies. Celery pushes processing to background workers.

**Gemini 2.5 Pro** — Native web search grounding means no separate search API. Natively multimodal so it reads images in PDFs and slides without extra preprocessing. Best-in-class long context for dense notes.

**K2 Thinking (MBZUAI)** — Game balance is a reasoning problem, not a generation problem. Deciding what makes a subtle sabotage vs an obvious one requires deliberation. A fast generation model gets this wrong and the game breaks.

---

## Task Split — 4 People, 24 Hours

### Person 1 — Backend & Real-Time Infrastructure
**Own:** FastAPI server, Socket.io room management, Redis game state, Celery task queue

**Hours 0–4: Foundation**
- Scaffold FastAPI project with python-socketio mounted
- Connect Redis (Railway instance)
- Implement room creation and join logic:
  - `POST /room/create` → generates 6-digit room code, stores in Redis
  - `POST /room/join` → validates code, adds player to room
- Define Redis schema:
```
room:{code}:state          → waiting | ingesting | playing | voting | ended
room:{code}:players        → list of playerIDs
room:{code}:impostor       → playerID
room:{code}:content        → serialized game JSON (problem + impostor directive)
room:{code}:contributions  → hash of playerID → their contribution text
room:{code}:turn           → current playerID
room:{code}:votes          → hash of playerID → votedForID
room:{code}:timer          → TTL key
```

**Hours 4–10: WebSocket Event System**
- Implement all Socket.io events:
```
Inbound:
  join_room, upload_complete, submit_contribution,
  call_meeting, cast_vote

Outbound:
  player_joined, game_start, contribution_update,
  turn_update, meeting_called, vote_result, elimination, game_over
```
- Implement turn rotation across all 4 players
- Implement voting: tally votes, resolve majority, emit result
- Implement timer: Redis TTL key, background task pings frontend on expiry

**Hours 10–16: Game State Machine**
- Build state machine:
```
waiting → ingesting → playing → voting → playing → ended
```
- Handle edge cases: player disconnect mid-game, vote ties, last player standing

**Hours 16–24: Integration + Debugging**
- Connect with Person 2's AI output format into Redis
- Connect with Person 3's frontend socket events
- Stress test multiple concurrent rooms

---

### Person 2 — AI Pipeline & File Ingestion
**Own:** File parsing, chunking, Gemini 2.5 Pro integration, K2 Thinking integration, Celery tasks

**Hours 0–4: Ingestion Pipeline**
- Set up Celery worker connected to Redis broker
- Build file extraction per type:
```python
# PDF
import fitz  # PyMuPDF
doc = fitz.open(filepath)
text = "\n".join([page.get_text() for page in doc])

# PPTX
from pptx import Presentation
prs = Presentation(filepath)
text = "\n".join([shape.text for slide in prs.slides
                  for shape in slide.shapes if shape.has_text_frame])

# APKG (Anki) — zip containing SQLite db
import zipfile, sqlite3
with zipfile.ZipFile(filepath) as z:
    z.extract("collection.anki2", "/tmp/")
conn = sqlite3.connect("/tmp/collection.anki2")
notes = conn.execute("SELECT flds FROM notes").fetchall()

# DOCX
from docx import Document
doc = Document(filepath)
text = "\n".join([p.text for p in doc.paragraphs])
```
- Chunk extracted text: 500 token chunks, 50 token overlap, tagged with source

**Hours 4–10: Gemini Integration**
- Call Gemini 2.5 Pro with web search grounding enabled:
```python
import google.generativeai as genai

model = genai.GenerativeModel("gemini-2.5-pro")
response = model.generate_content(
    contents=prompt,
    tools=[{"google_search_retrieval": {}}]
)
```
- Gemini's job: enrich the chunked notes with web context, then generate a collaborative problem and a raw impostor directive based on the subject
- Define strict output JSON schema that Gemini must return:
```json
{
  "subject": "string — detected subject area",
  "problem_statement": "string — the problem all players see",
  "contribution_slots": 4,
  "impostor_directive": "string — the hidden wrong objective/constraint",
  "web_sources": ["..."]
}
```

**Hours 10–16: K2 Thinking Integration**
- Call MBZUAI K2 API with Gemini's output as input:
```python
import requests

response = requests.post(
    "https://api.mbzuai.ac.ae/v1/chat/completions",
    headers={"Authorization": f"Bearer {K2_API_KEY}"},
    json={
        "model": "k2-thinking",
        "messages": [{"role": "user", "content": reasoning_prompt}]
    }
)
```
- K2's job: take Gemini's raw content and reason through:
  - Is the impostor directive subtle enough to not be immediately obvious?
  - Is it wrong enough to actually matter to the outcome?
  - Is the problem fair given the uploaded material?
  - Assign which player slot is the impostor
- Output a finalized game payload written to Redis by Person 1's backend

**Hours 16–24: Prompt Engineering + Edge Cases**
- Iterate on prompts based on garbage outputs (there will be garbage outputs)
- Handle API failures gracefully with fallback content
- Test ingestion on real PDFs, Anki decks, and lecture slides

---

### Person 3 — Frontend & Game UI
**Own:** Next.js app, all pages, Socket.io client, game UI

**Hours 0–4: App Scaffold + Lobby**
- Init Next.js 14 + TypeScript + Tailwind + Shadcn/ui
- Build pages:
  - `/` — landing page, create or join room
  - `/room/[code]` — lobby waiting room, shows connected players
  - `/game/[code]` — main game view
  - `/results/[code]` — end screen
- Connect Socket.io client:
```typescript
import { io } from "socket.io-client"
const socket = io(process.env.NEXT_PUBLIC_API_URL)
socket.emit("join_room", { roomCode, playerName })
socket.on("player_joined", (data) => setPlayers(data.players))
```

**Hours 4–10: Game UI**
- Problem display panel — shows problem statement to all players
- Contribution feed — live updating list of all player contributions as they come in via `contribution_update` socket event
- Input area — text/code input for current player's turn, locked for others
- Turn indicator — clearly shows whose turn it is
- Timer bar — countdown from `turn_update` payload
- Submit + confirm flow to prevent accidental sends

**Hours 10–16: Voting & Meeting UI**
- Emergency meeting modal (full screen takeover)
- Player cards with vote buttons
- Live vote tally updating via socket
- Reveal animation (pure CSS, no Framer) — flip card showing impostor and their hidden directive

**Hours 16–24: Polish + Integration**
- Connect all socket events to UI state
- Loading states for AI processing (upload → generating game)
- Error handling for disconnects
- Mobile responsiveness if time allows

---

### Person 4 — DevOps, Auth, Upload Flow & Integration
**Own:** Supabase setup, file upload endpoint, Vercel + Railway deployment, GoDaddy DNS, integration glue

**Hours 0–4: Infrastructure Setup**
- Spin up Supabase project: enable Storage, create tables:
```sql
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  subject TEXT,
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
```
- Deploy FastAPI to Railway, connect Redis add-on
- Deploy Next.js to Vercel, set environment variables

**Hours 4–10: File Upload Flow**
- Build `POST /upload` endpoint in FastAPI:
```python
@app.post("/upload")
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
```
- Set up GitHub repo, make sure all four people can push and deploy

**Hours 16–24: End-to-End Testing & Integration**
- Run full game flow end to end
- Find and fix integration bugs between frontend/backend/AI
- Make sure uploads work on prod (not just localhost)
- Prepare demo flow for judging — know exactly what you're clicking and in what order

---

## Critical Path

**Person 1's WebSocket state machine must be functional by Hour 10** so Person 3 can build UI against real events and Person 2 can test AI output flowing into actual game state. If this slips, everyone blocks.

Person 1 should expose a `/room/mock-start` endpoint that skips ingestion and emits `game_start` with hardcoded content so Person 3 is never waiting.
