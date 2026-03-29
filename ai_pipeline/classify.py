import json
import random
import re

from ai_pipeline.gemini import _call_gemini, _parse_json


def classify_and_build_search_prompt(chunks: list[dict]) -> dict:
    notes_text = "\n\n".join([f"[{c['source']}]\n{c['text']}" for c in chunks[:10]])

    prompt = (
        "You are analyzing student study notes to prepare an educational game.\n\n"
        "NOTES:\n"
        f"{notes_text}\n\n"
        "From these notes, identify:\n"
        "1. The subject domain (be specific — e.g. 'Organic Chemistry', 'Macroeconomics', 'Linear Algebra', not just 'Science' or 'Math')\n"
        "2. The 5-8 most important topics covered\n"
        "3. A web search prompt that will find a good collaborative problem for this subject\n\n"
        "The search prompt should:\n"
        "- Be 100-150 words\n"
        "- Ask for a problem that has multiple independent parts (each solvable without the others)\n"
        "- Be specific to the subject and key topics found in the notes\n"
        "- Ask for concrete problems with real numbers, formulas, or scenarios\n"
        "- Ask for core concepts, relevant facts, and sources\n\n"
        "Output ONLY a JSON object, nothing else, no markdown:\n"
        "{\n"
        '  "subject": "the specific subject domain",\n'
        '  "key_topics": ["topic1", "topic2", "..."],\n'
        '  "gemini_search_prompt": "your 100-150 word search prompt here"\n'
        "}\n"
    )

    raw = _call_gemini(prompt)
    clean = re.sub(r"```json|```", "", raw).strip()
    return _parse_json(clean)


def generate_game(classification: dict, research: dict, num_players: int) -> dict:
    subject = classification["subject"]
    key_topics = classification["key_topics"]
    impostor_slot = random.randint(1, num_players)

    tasks_shell = ""
    for i in range(1, num_players + 1):
        tasks_shell += f'    {{"slot": {i}, "player_directive": "BLANK"}}'
        if i < num_players:
            tasks_shell += ",\n"
        else:
            tasks_shell += "\n"

    prompt = (
        f"You are designing a {num_players}-player educational impostor game.\n\n"
        f"Subject: {subject}\n"
        f"Key topics: {', '.join(key_topics)}\n\n"
        f"Research material:\n{json.dumps(research, indent=2)}\n\n"
        f"Fill in every BLANK in the JSON below using the research material above. "
        "Do not change the JSON structure. Do not add or remove any fields. Only replace BLANK.\n\n"
        "Guidelines:\n"
        f"- problem_statement: a clear, specific problem about {subject} drawn from the research. "
        "It should be broad enough that each player has a meaningful independent part to contribute.\n"
        f"- player_directive for each slot: a specific, multi-step task related to {subject}. "
        "Each task should be self-contained — players should not need each other's answers to complete their own task. "
        "Use real terminology, formulas, or scenarios from the research.\n"
        f"- impostor_directive: a directive for slot {impostor_slot} that looks identical in style and format "
        "to the other player directives, but contains one subtle error — a wrong formula, reversed sign, "
        "incorrect method, or plausible but wrong fact. It must not be obviously wrong.\n"
        "- why_subtle: one sentence explaining what the error is and why it is easy to miss.\n\n"
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
    clean = re.sub(r"```json|```", "", raw).strip()
    return _parse_json(clean)
