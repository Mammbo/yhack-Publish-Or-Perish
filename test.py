# test.py
import json
import sys

from dotenv import load_dotenv

from ai_pipeline.extract import chunk_text, extract_text
from ai_pipeline.gemini import (
    classify_and_build_search_prompt,
    gemini_search,
    generate_game,
)

load_dotenv()


def test_pipeline(filepath: str, filetype: str, filename: str, num_players: int = 4):
    print(f"\n── Stage 1: Extracting text from {filename}...")
    text = extract_text(filepath, filetype)
    chunks = chunk_text(text, source=filename)
    print(f"✓ Extracted {len(chunks)} chunks")

    print("\n── Stage 2: Classifying subject + writing search prompt...")
    classification = classify_and_build_search_prompt(chunks)
    print(f"✓ Subject: {classification['subject']}")
    print(f"✓ Key topics: {', '.join(classification['key_topics'])}")
    print("✓ Search prompt written")

    print("\n── Stage 3: Gemini searching the web...")
    research = gemini_search(
        search_prompt=classification["gemini_search_prompt"],
        subject=classification["subject"],
    )
    print(f"✓ Core concepts found: {len(research['core_concepts'])}")
    print(f"✓ Sources: {research.get('web_sources', [])}")

    print(f"\n── Stage 4: Generating game for {num_players} players...")
    game_payload = generate_game(classification, research, num_players)

    print("\n══════════════ FINAL GAME PAYLOAD ══════════════")
    print(json.dumps(game_payload, indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 3 or len(sys.argv) > 4:
        print("Usage: python test.py <filepath> <filetype> [num_players]")
        print("Example: python test.py notes.pdf pdf 4")
        sys.exit(1)

    filepath = sys.argv[1]
    filetype = sys.argv[2]
    num_players = int(sys.argv[3]) if len(sys.argv) == 4 else 4
    filename = filepath.split("/")[-1]

    test_pipeline(filepath, filetype, filename, num_players)
