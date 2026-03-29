# pipeline.py
from dotenv import load_dotenv

load_dotenv()

import os

import httpx
from celery import Celery

from ai_pipeline.db import set_game_ready, update_room
from ai_pipeline.extract import chunk_text, extract_text
from ai_pipeline.gemini import (
    classify_and_build_search_prompt,
    gemini_search,
    generate_game,
)

celery_app = Celery(
    "tasks", broker=os.environ["REDIS_URL"], backend=os.environ["REDIS_URL"]
)

BACKEND_URL = os.environ.get("BACKEND_URL", "").rstrip("/")
if not BACKEND_URL:
    raise RuntimeError(
        "BACKEND_URL env var is not set. Set it to the Railway backend URL "
        "(e.g. https://yhack-publish-or-perish-production-e377.up.railway.app)"
    )


@celery_app.task(bind=True, max_retries=2)
def process_files_and_generate_game(
    self, room_code: str, file_paths: list[dict], num_players: int = 4
):
    """
    file_paths: [{"path": "/tmp/...", "type": "pdf", "name": "lecture1.pdf"}, ...]
    num_players: number of players in the room (determines number of tasks generated)
    """
    try:
        update_room(room_code, {"state": "ingesting"})

        # ── Stage 1: Extract + chunk ──────────────────────────────────────────
        all_chunks = []
        for file_info in file_paths:
            text = extract_text(file_info["path"], file_info["type"])
            chunks = chunk_text(text, source=file_info["name"])
            all_chunks.extend(chunks)

        if not all_chunks:
            raise ValueError("No text could be extracted from uploaded files")

        # ── Stage 2: Classify subject + write search prompt ───────────────────
        classification = classify_and_build_search_prompt(all_chunks)

        # ── Stage 3: Gemini web search ────────────────────────────────────────
        research = gemini_search(
            search_prompt=classification["gemini_search_prompt"],
            subject=classification["subject"],
        )

        # ── Stage 4: Generate game ────────────────────────────────────────────
        game_payload = generate_game(classification, research, num_players)

        # ── Stage 5: Write to MongoDB + notify Person 1 ───────────────────────
        set_game_ready(room_code, game_payload)
        httpx.post(
            f"{BACKEND_URL}/room/game-ready",
            json={"room_code": room_code, "content": game_payload},
            timeout=30,
        )

    except Exception as exc:
        print(f"[pipeline] Error for room {room_code}: {exc}")
        update_room(room_code, {"state": "failed"})
        httpx.post(
            f"{BACKEND_URL}/room/game-failed",
            json={"room_code": room_code},
            timeout=10,
        )
        raise self.retry(exc=exc, countdown=5)
