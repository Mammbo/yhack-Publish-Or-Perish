"""
tasks.py — Celery task stub for the backend.

WHY A STUB AND NOT A DIRECT IMPORT FROM pipeline.py:
The backend runs from the backend/ directory (see railway.toml). pipeline.py
lives at the project root and depends on ai_pipeline/, which is not in the
backend's Python path. Importing the full pipeline here would drag in every
AI/extraction dependency (PyMuPDF, pptx, docx, etc.) into the backend service.

Instead, this stub registers a Celery task with the same name that pipeline.py
uses. When .delay() is called here, Celery serializes the arguments and puts
them on the Redis broker queue. The pipeline Celery worker (running at the
project root) picks up the message and executes the real function. The task
name must match exactly — it's the key Celery uses to route the message.
"""

import os

from celery import Celery

celery_app = Celery(
    "pipeline",
    broker=os.environ["REDIS_URL"],
    backend=os.environ["REDIS_URL"],
)


@celery_app.task(name="pipeline.process_files_and_generate_game")
def process_files_and_generate_game(
    room_code: str, file_paths: list, num_players: int = 4
):
    # Execution happens in the pipeline Celery worker, not here.
    raise NotImplementedError("This task runs in the pipeline worker")
