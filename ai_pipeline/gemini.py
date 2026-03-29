import json
import os
import random
import re

import httpx
from dotenv import load_dotenv

load_dotenv()


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────


def _call_gemini(prompt: str) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("Missing GEMINI_API_KEY")

    response = httpx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        params={"key": api_key},
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=60,
    )

    response.raise_for_status()
    data = response.json()

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception:
        raise ValueError(f"Bad Gemini response: {data}")


def _clean_json(raw: str) -> str:
    return re.sub(r"```json|```", "", raw).strip()


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 🔥 fallback: try to extract JSON block
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


# ─────────────────────────────────────────────
# Stage 2: Classification + Search Prompt
# ─────────────────────────────────────────────


def classify_and_build_search_prompt(chunks: list[dict]) -> dict:
    notes_text = "\n\n".join([f"[{c['source']}]\n{c['text']}" for c in chunks[:10]])

    prompt = (
        "You are analyzing student study notes to prepare an educational game.\n\n"
        "NOTES:\n"
        f"{notes_text}\n\n"
        "From these notes, identify:\n"
        "1. The subject domain (be specific — e.g. 'Organic Chemistry', 'Macroeconomics', 'Linear Algebra')\n"
        "2. The 5-8 most important topics covered\n"
        "3. A web search prompt that will find a good collaborative problem\n\n"
        "The search prompt should:\n"
        "- Be 100-150 words\n"
        "- Ask for a problem with multiple independent parts\n"
        "- Be specific to the subject\n"
        "- Include real numbers, formulas, or scenarios\n"
        "- Ask for concepts + sources\n\n"
        "Output ONLY JSON:\n"
        "{\n"
        '  "subject": "...",\n'
        '  "key_topics": ["..."],\n'
        '  "gemini_search_prompt": "..."\n'
        "}\n"
    )

    raw = _call_gemini(prompt)
    clean = _clean_json(raw)
    return _parse_json(clean)


# ─────────────────────────────────────────────
# Stage 3: Research
# ─────────────────────────────────────────────


def gemini_search(search_prompt: str, subject: str) -> dict:
    prompt = (
        f"{search_prompt}\n\n"
        "Return structured JSON:\n"
        "{\n"
        '  "core_concepts": ["key ideas, formulas, facts"],\n'
        '  "example_problems": ["short example problems if possible"],\n'
        '  "web_sources": ["relevant links or sources"]\n'
        "}\n"
    )

    raw = _call_gemini(prompt)
    clean = _clean_json(raw)
    return _parse_json(clean)


# ─────────────────────────────────────────────
# Stage 4: Game Generation
# ─────────────────────────────────────────────


def generate_game(classification: dict, research: dict, num_players: int) -> dict:
    subject = classification["subject"]
    key_topics = classification["key_topics"]
    impostor_slot = random.randint(1, num_players)

    tasks_shell = ""
    for i in range(1, num_players + 1):
        tasks_shell += f'    {{"slot": {i}, "player_directive": "BLANK"}}'
        tasks_shell += ",\n" if i < num_players else "\n"

    prompt = (
        f"You are designing a {num_players}-player educational impostor game.\n\n"
        f"Subject: {subject}\n"
        f"Key topics: {', '.join(key_topics)}\n\n"
        f"Research material:\n{json.dumps(research, indent=2)}\n\n"
        "Fill in the JSON below. Replace ONLY BLANK.\n\n"
        "Rules:\n"
        "- problem_statement: clear, specific, multi-part problem\n"
        "- player_directive: independent, multi-step tasks\n"
        "- impostor_directive: same style but subtly wrong\n"
        "- why_subtle: explain why it's hard to catch\n\n"
        "{\n"
        '  "problem_statement": "BLANK",\n'
        '  "tasks": [\n'
        f"{tasks_shell}"
        "  ],\n"
        f'  "impostor_slot": {impostor_slot},\n'
        '  "impostor_directive": "BLANK",\n'
        '  "why_subtle": "BLANK"\n'
        "}\n"
    )

    raw = _call_gemini(prompt)
    clean = _clean_json(raw)
    return _parse_json(clean)
