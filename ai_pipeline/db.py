import os
from datetime import datetime, timezone

from pymongo import MongoClient

client = MongoClient(os.environ["MONGODB_URI"])
db = client["publish_or_perish"]
rooms = db["rooms"]


def update_room(room_code: str, fields: dict) -> None:
    rooms.update_one({"room_code": room_code}, {"$set": fields})


def set_game_ready(room_code: str, game_content: dict) -> None:
    update_room(
        room_code,
        {
            "state": "ready",
            "game_content": game_content,
            "updated_at": datetime.now(timezone.utc),
        },
    )
