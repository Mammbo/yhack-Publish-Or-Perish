# Person 2 — AI Pipeline & File Ingestion

**Own:** File parsing, chunking, Gemini 2.5 Pro integration, K2 Thinking integration, Celery tasks

**Your job:** Take whatever files players upload, extract the text, enrich it with web context via Gemini, then use K2 Thinking to reason out a fair, subject-appropriate game — a problem statement all players see, and a hidden sabotage directive only the impostor sees.

---

## How Your Piece Fits

```
Person 4 (upload) → saves file to temp storage → triggers your Celery task
You               → parse file → call Gemini → call K2 → write result to Redis
Person 1 (backend)→ reads Redis → starts game → sends directive to impostor
```

Your output is a JSON blob in Redis. Everything downstream depends on it being clean.

---

## Stack

| Tech | Role | Docs |
|---|---|---|
| Celery | Async task queue — runs your AI jobs in the background | https://docs.celeryq.dev/en/stable/ |
| Redis | Celery broker + result backend | https://redis.io/docs/latest/develop/data-types/ |
| PyMuPDF (fitz) | PDF text + image extraction | https://pymupdf.readthedocs.io/en/latest/ |
| python-pptx | PowerPoint text extraction | https://python-pptx.readthedocs.io/en/latest/ |
| python-docx | Word doc text extraction | https://python-docx.readthedocs.io/en/latest/ |
| Gemini 2.5 Pro | Web-grounded problem generation | https://ai.google.dev/gemini-api/docs |
| K2 Thinking (MBZUAI) | Reasoning model — game balance + impostor directive | https://ai71.ai/k2 |

---

## Hours 0–4: Ingestion Pipeline

### 1. Set Up Celery

Celery runs your AI jobs as background tasks so FastAPI never blocks.

**Celery getting started:** https://docs.celeryq.dev/en/stable/getting-started/first-steps-with-celery.html
**Celery with Redis broker:** https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/redis.html

```python
from celery import Celery
import os

celery_app = Celery(
    "tasks",
    broker=os.environ["REDIS_URL"],
    backend=os.environ["REDIS_URL"]
)
```

### 2. File Extraction Per Type

**PyMuPDF docs:** https://pymupdf.readthedocs.io/en/latest/tutorial.html
**python-pptx docs:** https://python-pptx.readthedocs.io/en/latest/user/quickstart.html
**python-docx docs:** https://python-docx.readthedocs.io/en/latest/

```python
import fitz          # PyMuPDF
from pptx import Presentation
from docx import Document
import zipfile, sqlite3

def extract_text(filepath: str, file_type: str) -> str:
    if file_type == "pdf":
        doc = fitz.open(filepath)
        return "\n".join([page.get_text() for page in doc])

    elif file_type == "pptx":
        prs = Presentation(filepath)
        return "\n".join([
            shape.text for slide in prs.slides
            for shape in slide.shapes if shape.has_text_frame
        ])

    elif file_type == "docx":
        doc = Document(filepath)
        return "\n".join([p.text for p in doc.paragraphs])

    elif file_type == "txt" or file_type == "md":
        with open(filepath, "r") as f:
            return f.read()

    elif file_type == "apkg":
        # Anki deck — zip file containing a SQLite database
        with zipfile.ZipFile(filepath) as z:
            z.extract("collection.anki2", "/tmp/")
        conn = sqlite3.connect("/tmp/collection.anki2")
        notes = conn.execute("SELECT flds FROM notes").fetchall()
        return "\n".join([note[0].replace("\x1f", " | ") for note in notes])

    return ""
```

### 3. Chunk the Text

Split into overlapping chunks so Gemini has focused context rather than one massive dump. Tag each chunk with its source file.

```python
def chunk_text(text: str, source: str, chunk_size: int = 500, overlap: int = 50) -> list[dict]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append({"source": source, "text": chunk})
        i += chunk_size - overlap
    return chunks
```

---

## Hours 4–10: Gemini Integration

### What Gemini Does

Gemini 2.5 Pro reads the chunked notes plus searches the web for additional context on the subject. Its job is to:
1. Identify the subject area from the notes
2. Generate a rich, specific collaborative problem based on that subject
3. Generate a raw impostor directive (K2 will refine this)

**Gemini API docs:** https://ai.google.dev/gemini-api/docs
**Gemini web search grounding:** https://ai.google.dev/gemini-api/docs/grounding
**google-generativeai Python SDK:** https://ai.google.dev/gemini-api/docs/quickstart?lang=python

```python
import google.generativeai as genai
import os

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-2.5-pro")
```

### Gemini Prompt

```python
def build_gemini_prompt(chunks: list[dict]) -> str:
    notes_text = "\n\n".join([f"[{c['source']}]\n{c['text']}" for c in chunks])
    return f"""
You are generating content for a multiplayer study game called Publish or Perish.

Here are a student's study notes:
{notes_text}

Based on these notes, do the following:
1. Identify the subject area (e.g. calculus, organic chemistry, data structures, European history)
2. Generate a collaborative problem that 4 players will work on together. It should be meaty enough that each player has a meaningful contribution to make.
3. Generate a sabotage directive — a specific, plausible-sounding but wrong instruction that one player (the impostor) will secretly be told to follow. It should be subtle enough that other players won't immediately notice, but wrong enough to affect the outcome.

Use web search to enrich your understanding of the subject before generating the problem.

Return ONLY valid JSON matching this exact schema:
{{
  "subject": "string",
  "problem_statement": "string — the problem shown to all players",
  "raw_impostor_directive": "string — rough sabotage idea, K2 will refine this",
  "web_sources": ["string"]
}}
"""
```

### Call Gemini with Web Grounding

```python
def call_gemini(chunks: list[dict]) -> dict:
    prompt = build_gemini_prompt(chunks)
    response = model.generate_content(
        contents=prompt,
        tools=[{"google_search_retrieval": {}}]
    )
    import json, re
    text = response.text
    # Strip markdown code fences if present
    text = re.sub(r"```json|```", "", text).strip()
    return json.loads(text)
```

---

## Hours 10–16: K2 Thinking Integration

### What K2 Does

K2 is a reasoning model. Give it Gemini's raw output and ask it to think carefully about whether the impostor directive is subtle enough, fair, and subject-appropriate. It refines the directive and validates the problem.

**K2 API (confirm exact endpoint with team):** https://ai71.ai/k2

```python
import requests

def call_k2(gemini_output: dict, player_count: int = 4) -> dict:
    prompt = f"""
You are balancing a multiplayer impostor game called Publish or Perish.

Subject: {gemini_output['subject']}
Problem given to all players: {gemini_output['problem_statement']}
Proposed impostor sabotage: {gemini_output['raw_impostor_directive']}

Think carefully and answer:
1. Is this sabotage subtle enough that other players won't notice it immediately during play?
2. Is it wrong enough that it will actually affect the outcome if not caught?
3. Is the problem fair — can all {player_count} players make a meaningful contribution?
4. Refine the impostor directive to be as plausible and natural-sounding as possible.

Return ONLY valid JSON:
{{
  "problem_statement": "string — approved or slightly improved version",
  "impostor_directive": "string — final, refined sabotage directive",
  "reasoning": "string — brief explanation of your balance decisions"
}}
"""
    response = requests.post(
        "https://api.ai71.ai/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['K2_API_KEY']}"},
        json={
            "model": "tiiuae/falcon-h1-34b",
            "messages": [{"role": "user", "content": prompt}]
        }
    )
    import json, re
    text = response.json()["choices"][0]["message"]["content"]
    text = re.sub(r"```json|```", "", text).strip()
    return json.loads(text)
```

---

## The Full Celery Task

This is what Person 4's upload endpoint triggers. When it finishes it calls Person 1's `/room/game-ready` endpoint.

**Celery task docs:** https://docs.celeryq.dev/en/stable/userguide/tasks.html

```python
import httpx

@celery_app.task(bind=True, max_retries=2)
def process_files_and_generate_game(self, room_code: str, file_paths: list[dict]):
    try:
        # 1. Extract + chunk all files
        all_chunks = []
        for file_info in file_paths:
            text = extract_text(file_info["path"], file_info["type"])
            chunks = chunk_text(text, source=file_info["name"])
            all_chunks.extend(chunks)

        # 2. Call Gemini
        gemini_output = call_gemini(all_chunks)

        # 3. Call K2
        k2_output = call_k2(gemini_output)

        # 4. Write final content to Redis
        import redis, json, os
        r = redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
        final_content = {
            "problem_statement": k2_output["problem_statement"],
            "impostor_directive": k2_output["impostor_directive"],
            "contribution_slots": 4
        }
        r.set(f"room:{room_code}:content", json.dumps(final_content))

        # 5. Notify Person 1's backend that the game is ready
        httpx.post(f"{os.environ['BACKEND_URL']}/room/game-ready?room_code={room_code}")

    except Exception as exc:
        # Notify backend of failure so it can reset state
        httpx.post(f"{os.environ['BACKEND_URL']}/room/game-failed?room_code={room_code}")
        raise self.retry(exc=exc, countdown=5)
```

---

## Hours 16–24: Prompt Engineering + Edge Cases

**The outputs will be garbage at first. That is normal. Iterate.**

Common failure modes and fixes:

| Problem | Fix |
|---|---|
| Gemini returns invalid JSON | Add `re.sub` to strip markdown fences, add try/except with fallback |
| Impostor directive is too obvious ("just give the wrong answer") | Tighten K2 prompt — add examples of good vs bad directives |
| Problem is too vague for players to contribute meaningfully | Add "each of 4 players must be able to add one distinct step or component" to Gemini prompt |
| K2 changes the problem too much from Gemini's version | Instruct K2 to preserve the problem and only modify the directive |
| API rate limit or timeout | Celery retry with `max_retries=2, countdown=5` |

### Fallback Content

If both AI calls fail, emit a generic fallback so the game isn't blocked:

```python
FALLBACK_CONTENT = {
    "problem_statement": "Explain how a hash table works. Each player should describe one key aspect: structure, insertion, lookup, and collision handling.",
    "impostor_directive": "When explaining lookup, describe it as always taking O(n) time regardless of load factor.",
    "contribution_slots": 4
}
```

---

## Project Setup

```bash
pip install celery "redis[asyncio]" google-generativeai pymupdf python-pptx python-docx httpx python-dotenv

# .env
REDIS_URL=redis://...
GEMINI_API_KEY=...
K2_API_KEY=...
BACKEND_URL=https://api.publishorperish.com  # or http://localhost:8000 locally

# Run Celery worker
celery -A tasks worker --loglevel=info
```

**Celery worker docs:** https://docs.celeryq.dev/en/stable/userguide/workers.html
