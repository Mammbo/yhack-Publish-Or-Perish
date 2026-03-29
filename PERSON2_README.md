# Person 2 — AI Pipeline & File Ingestion

**Own:** File parsing, chunking, Gemini 2.5 Pro integration, K2 Thinking integration, Celery tasks

**Your job:** Take whatever files players upload, extract the text, use K2 to classify the subject and write a targeted search prompt, hand that to Gemini to search the web for verified content, then pass Gemini's research back to K2 to reason out a fair, subject-appropriate game — a problem statement all players see, and a hidden sabotage directive only the impostor sees.

---

## How Your Piece Fits

```
Person 4 (upload) → saves file to temp storage → triggers your Celery task
You               → parse file → K2 (classify + write search prompt) → Gemini (web search only) → K2 (generate game) → write result to MongoDB
Person 1 (backend)→ reads MongoDB → starts game → sends directive to impostor
```

Your output is a JSON document in MongoDB. Everything downstream depends on it being clean.

---

## Architecture: Why This Split

| Model | Role | Why |
|---|---|---|
| K2 Think v2 (Call 1) | Classify subject + write Gemini search prompt | K2 reasons about what to look for, not just what's in the notes |
| Gemini 2.5 Pro | Web search only — return verified facts, problems, code snippets | Gemini's strength is grounded web retrieval, not game design |
| K2 Think v2 (Call 2) | Take Gemini's research and generate the full balanced game | Game balance is a reasoning problem — subtlety of sabotage requires deliberation |

Gemini never generates game content. K2 never searches the web. Each does what it's built for.

---

## Stack

| Tech | Role | Docs |
|---|---|---|
| Celery | Async task queue — runs your AI jobs in the background | https://docs.celeryq.dev/en/stable/ |
| Redis | Celery broker only (not game state) | https://redis.io/docs/latest/ |
| MongoDB | Game state storage — rooms, content, players | https://www.mongodb.com/docs/drivers/pymongo/ |
| PyMuPDF (fitz) | PDF text + image extraction | https://pymupdf.readthedocs.io/en/latest/ |
| python-pptx | PowerPoint text extraction | https://python-pptx.readthedocs.io/en/latest/ |
| python-docx | Word doc text extraction | https://python-docx.readthedocs.io/en/latest/ |
| Gemini 2.5 Pro | Web-grounded research retrieval only | https://ai.google.dev/gemini-api/docs |
| K2 Think v2 (MBZUAI) | Classification + game generation via reasoning | https://ai71.ai/k2 |

---

## Hours 0–4: Ingestion Pipeline

### 1. Set Up Celery

Celery runs your AI jobs as background tasks so FastAPI never blocks. Redis is used only as the Celery broker — game state goes to MongoDB.

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

    elif file_type in ("txt", "md"):
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

## Hours 4–10: K2 Call 1 — Classify + Write Gemini Search Prompt

K2's first job is to read the chunked notes, identify the subject, and write a precise research prompt for Gemini to search against. K2 is better at this than Gemini because it reasons about *what to look for* rather than just summarizing what's there.

```python
import requests, json, re, os

K2_URL = "https://api.ai71.ai/v1/chat/completions"

def _call_k2(prompt: str) -> str:
    response = requests.post(
        K2_URL,
        headers={"Authorization": f"Bearer {os.environ['K2_API_KEY']}"},
        json={
            "model": "tiiuae/falcon-h1-34b",
            "messages": [{"role": "user", "content": prompt}]
        }
    )
    return response.json()["choices"][0]["message"]["content"]

def _parse_json(text: str) -> dict:
    clean = re.sub(r"```json|```", "", text).strip()
    return json.loads(clean)


def k2_classify_and_prompt(chunks: list[dict]) -> dict:
    notes_text = "\n\n".join([f"[{c['source']}]\n{c['text']}" for c in chunks[:10]])

    prompt = f"""You are analyzing student study notes to prepare an educational game.

NOTES:
{notes_text}

Your task has TWO parts.

PART 1 — CLASSIFY
Determine:
- subject: the specific subject domain (e.g. "Linear Algebra", "Organic Chemistry")
- game_mode: exactly one of ["coding", "stem", "conceptual"]
  - coding: programming, CS theory, software engineering, algorithms
  - stem: math, physics, chemistry, biology, economics — anything with quantitative multi-step problems
  - conceptual: humanities, psychology, political science, history, literature, sociology

PART 2 — WRITE A GEMINI SEARCH PROMPT
Write a focused research prompt (150-200 words) instructing Gemini to search the web and return:
- The 5-8 most important core concepts in this subject from these notes
- For coding mode: a real, accurate code snippet (20-40 lines) relevant to the subject
- For stem mode: a real multi-step problem (4-6 steps) with a known correct solution, typical of this subject
- For conceptual mode: two closely related but meaningfully distinct terms from this subject that would confuse a student who only partially understands the material

Respond ONLY as valid JSON, no markdown, no preamble:
{{
  "subject": "string",
  "game_mode": "coding|stem|conceptual",
  "key_topics": ["topic1", "topic2"],
  "gemini_search_prompt": "string"
}}"""

    return _parse_json(_call_k2(prompt))
```

---

## Hours 4–10: Gemini — Web Search Only

Gemini's only job is to search the web and return verified factual content. It does not generate game content. No sabotage, no balance decisions — just research.

```python
import google.generativeai as genai

genai.configure(api_key=os.environ["GEMINI_API_KEY"])

def gemini_search(search_prompt: str, subject: str, game_mode: str) -> dict:
    prompt = f"""You are a research assistant. Use your web search to answer the following research request accurately.

{search_prompt}

Return your findings ONLY as valid JSON, no markdown, no preamble:
{{
  "subject": "{subject}",
  "game_mode": "{game_mode}",
  "core_concepts": [
    {{"concept": "string", "explanation": "string"}}
  ],
  "raw_content": {{
    "coding": {{
      "language": "string",
      "snippet": "full accurate code string",
      "snippet_description": "what this code does"
    }},
    "stem": {{
      "problem_statement": "string",
      "steps": [
        {{"step_num": 1, "operation": "string", "result": "string"}}
      ],
      "final_answer": "string",
      "source": "textbook or URL this problem is drawn from"
    }},
    "conceptual": {{
      "term_a": "string",
      "term_b": "string",
      "term_a_definition": "string",
      "term_b_definition": "string",
      "key_distinction": "string"
    }}
  }},
  "web_sources": ["url1", "url2"]
}}

Only populate the field inside raw_content that matches game_mode: {game_mode}.
Set the other two to null."""

    model = genai.GenerativeModel("gemini-2.5-pro")
    response = model.generate_content(
        contents=prompt,
        tools=[{"google_search_retrieval": {}}]
    )
    clean = re.sub(r"```json|```", "", response.text).strip()
    return json.loads(clean)
```

---

## Hours 10–16: K2 Call 2 — Generate the Game

K2's second job is to take Gemini's verified research and reason through the full game design. This is a reasoning problem: deciding where to place the sabotage, how subtle to make it, and whether the game is winnable. A generation model gets this wrong.

```python
GAME_SCHEMAS = {
    "coding": """{
  "subject_type": "coding",
  "game_content": {
    "language": "string",
    "code_file": "full code string",
    "tasks": [
      {"task_id": 1, "description": "string", "line_numbers": [n, m]}
    ],
    "impostor_sabotage": {
      "description": "string",
      "line_number": n,
      "sabotaged_code": "string",
      "why_subtle": "string"
    }
  }
}""",
    "stem": """{
  "subject_type": "stem",
  "game_content": {
    "problem_statement": "string",
    "steps": [
      {"step_num": 1, "correct_answer": "string", "hint": "string"}
    ],
    "impostor_step": {
      "step_num": 2,
      "sabotaged_answer": "string",
      "why_subtle": "string"
    },
    "final_answer": "string"
  }
}""",
    "conceptual": """{
  "subject_type": "conceptual",
  "game_content": {
    "real_word": "string",
    "impostor_word": "string",
    "why_close": "string",
    "example_valid_associations": ["word1", "word2", "word3"],
    "example_valid_description": "string"
  }
}"""
}


def k2_generate_game(k2_classification: dict, gemini_research: dict) -> dict:
    mode = k2_classification["game_mode"]
    subject = k2_classification["subject"]

    prompt = f"""You are designing a balanced multiplayer impostor-style educational game.

Subject: {subject}
Game mode: {mode}

Here is verified research about this subject retrieved from the web:
{json.dumps(gemini_research, indent=2)}

Using this research as your source of truth, reason carefully through:
1. What tasks/steps to assign to players — they must be distinct and appropriately difficult
2. Where to place the impostor sabotage — it must be subtle, not immediately obvious
3. Whether the game is winnable — crewmates must be able to catch the impostor with careful attention

For the impostor sabotage specifically, think through:
- Would an inattentive player miss this? (good)
- Would even an attentive player struggle to catch it? (too subtle — adjust)
- Is it so obviously wrong it gets caught immediately? (too obvious — adjust)

Return ONLY valid JSON matching this schema exactly, no markdown:
{GAME_SCHEMAS[mode]}"""

    return _parse_json(_call_k2(prompt))
```

---

## MongoDB Interface

```python
from pymongo import MongoClient
from datetime import datetime, timezone

client = MongoClient(os.environ["MONGODB_URI"])
db = client["publish_or_perish"]
rooms = db["rooms"]

def update_room(room_code: str, fields: dict) -> None:
    rooms.update_one(
        {"room_code": room_code},
        {"$set": fields}
    )

def set_game_ready(room_code: str, game_mode: str, game_content: dict) -> None:
    update_room(room_code, {
        "state": "ready",
        "game_mode": game_mode,
        "game_content": game_content,
        "updated_at": datetime.now(timezone.utc)
    })
```

---

## The Full Celery Task

This is what Person 4's upload endpoint triggers. When it finishes it notifies Person 1's backend.

```python
import httpx
from celery import Celery

celery_app = Celery("tasks", broker=os.environ["REDIS_URL"], backend=os.environ["REDIS_URL"])

FALLBACKS = {
    "coding": {
        "subject_type": "coding",
        "game_content": {
            "language": "python",
            "code_file": "def add(a, b):\n    return a - b\n",
            "tasks": [{"task_id": 1, "description": "Verify the add function returns correct results", "line_numbers": [1, 2]}],
            "impostor_sabotage": {
                "description": "Subtraction used instead of addition",
                "line_number": 2,
                "sabotaged_code": "return a - b",
                "why_subtle": "Easy to miss the minus sign at a glance"
            }
        }
    },
    "stem": {
        "subject_type": "stem",
        "game_content": {
            "problem_statement": "Solve for x: 2x + 4 = 10",
            "steps": [
                {"step_num": 1, "correct_answer": "2x = 6", "hint": "Subtract 4 from both sides"},
                {"step_num": 2, "correct_answer": "x = 3", "hint": "Divide both sides by 2"}
            ],
            "impostor_step": {"step_num": 1, "sabotaged_answer": "2x = 14", "why_subtle": "Adding instead of subtracting"},
            "final_answer": "x = 3"
        }
    },
    "conceptual": {
        "subject_type": "conceptual",
        "game_content": {
            "real_word": "mitosis",
            "impostor_word": "meiosis",
            "why_close": "Both are cell division processes, easy to conflate",
            "example_valid_associations": ["cell", "division", "chromosomes"],
            "example_valid_description": "The process by which a cell duplicates its chromosomes and divides into two identical daughter cells"
        }
    }
}


@celery_app.task(bind=True, max_retries=2)
def process_files_and_generate_game(self, room_code: str, file_paths: list[dict]):
    """
    file_paths: [{"path": "/tmp/...", "type": "pdf", "name": "lecture1.pdf"}, ...]
    """
    try:
        update_room(room_code, {"state": "ingesting"})

        # Stage 1: Extract + chunk all files
        all_chunks = []
        for file_info in file_paths:
            text = extract_text(file_info["path"], file_info["type"])
            chunks = chunk_text(text, source=file_info["name"])
            all_chunks.extend(chunks)

        if not all_chunks:
            raise ValueError("No text could be extracted from uploaded files")

        # Stage 2: K2 classifies subject + writes Gemini search prompt
        k2_classification = k2_classify_and_prompt(all_chunks)
        game_mode = k2_classification["game_mode"]

        # Stage 3: Gemini searches the web — research only, no game generation
        gemini_research = gemini_search(
            search_prompt=k2_classification["gemini_search_prompt"],
            subject=k2_classification["subject"],
            game_mode=game_mode
        )

        # Stage 4: K2 reasons through game design using Gemini's research
        game_payload = k2_generate_game(k2_classification, gemini_research)

        # Write to MongoDB
        set_game_ready(room_code, game_mode, game_payload)

        # Notify Person 1's backend
        httpx.post(f"{os.environ['BACKEND_URL']}/room/game-ready?room_code={room_code}")

    except Exception as exc:
        # Fall back to hardcoded game so room doesn't get stuck
        print(f"[pipeline] Error for room {room_code}: {exc}")
        fallback_mode = "stem"
        set_game_ready(room_code, fallback_mode, FALLBACKS[fallback_mode])
        httpx.post(f"{os.environ['BACKEND_URL']}/room/game-ready?room_code={room_code}")
        raise self.retry(exc=exc, countdown=5)
```

---

## Hours 16–24: Prompt Engineering + Edge Cases

**The outputs will be garbage at first. That is normal. Iterate.**

| Problem | Fix |
|---|---|
| K2 misclassifies subject (e.g. "computational biology" → conceptual instead of stem) | Add explicit examples to the classify prompt |
| Gemini returns invalid JSON | `re.sub` to strip markdown fences + try/except with fallback |
| Gemini populates the wrong `raw_content` field | Restate the game_mode constraint at the end of the prompt |
| K2 `why_subtle` is vague ("the answer is wrong") | Tighten the sabotage rubric in K2 Call 2 — add good/bad examples |
| K2 changes the problem too much from Gemini's research | Instruct K2 explicitly: "use the problem from the research as-is, only design the sabotage" |
| Either API times out | Celery retry with `max_retries=2, countdown=5` + fallback content on final failure |

---

## Project Setup

```bash
pip install celery "redis[asyncio]" google-generativeai pymupdf python-pptx python-docx httpx pymongo python-dotenv

# .env
REDIS_URL=redis://...           # Celery broker only
MONGODB_URI=mongodb+srv://...   # Game state
GEMINI_API_KEY=...
K2_API_KEY=...
BACKEND_URL=https://api.publishorperish.com  # or http://localhost:8000 locally

# Run Celery worker
celery -A tasks worker --loglevel=info
```

---

## Critical Path Note

Person 1's state machine reads `game_content` and `game_mode` from MongoDB once state is `"ready"`. Your Celery task must write these fields and then hit `/room/game-ready` — that's the handoff. If this is late, Person 1 and Person 3 both block. Have the fallback content wired in by Hour 8 so integration testing can start even if the AI calls aren't tuned yet.
