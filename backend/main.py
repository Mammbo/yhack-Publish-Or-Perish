"""
main.py — FastAPI app + Socket.io server.

WHY BOTH HTTP AND SOCKET.IO IN ONE PROCESS:
Running them separately = two Railway services, more CORS config, more
moving parts to break during the demo. python-socketio mounts as an ASGI
sub-app inside FastAPI — one process, one port, one deployment.

THE GAME MODEL — COLLABORATIVE MARKDOWN DOC:
Think of the game as a shared live document. All players see the same
problem and edit the same response together in real time, like a Google
Doc. Every submission immediately broadcasts to all players. The impostor
is just another contributor whose changes are secretly guided by a wrong
directive. There are no turns, no timers, no locked input — anyone can
update their contribution at any time.

WHY LIFESPAN INSTEAD OF @app.on_event("startup"):
on_event("startup") is deprecated in FastAPI. lifespan is the current
pattern — startup and shutdown logic live together in a context manager
and cleanup is guaranteed even if startup crashes.
"""

import asyncio
import json
import os
import random
import string
import sys
from contextlib import asynccontextmanager
from typing import List

# Make the repo root importable so ai_pipeline/* works from the backend service
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import socketio
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


class CreateRoomRequest(BaseModel):
    player_id: str
    player_name: str


class JoinRoomRequest(BaseModel):
    room_code: str
    player_id: str
    player_name: str


class MockStartRequest(BaseModel):
    room_code: str


class GameReadyRequest(BaseModel):
    room_code: str
    content: dict  # AI-generated payload forwarded directly from the pipeline worker


class GameFailedRequest(BaseModel):
    room_code: str


class RestartRequest(BaseModel):
    room_code: str


import uuid
from datetime import datetime

import state
from db import files_col, sessions_col
from redis_client import close_redis

# ── Socket.io server ───────────────────────────────────────────────────────────

# WHY async_mode="asgi":
# Required for asyncio/FastAPI compatibility. Alternatives (gevent, threading)
# would conflict with FastAPI's event loop.
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")


# ── Lifespan ───────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_redis()


# ── FastAPI app ────────────────────────────────────────────────────────────────

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://publishorperish.com",
        "https://www.publishorperish.com",
        "https://yhack-publish-or-perish.vercel.app",
        "https://yhack-publish-or-perish-git-main-mammbos-projects.vercel.app",
        "https://yhack-publish-or-perish-m3ps79m1z-mammbos-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ASGIApp makes Socket.io handle WebSocket upgrades while delegating all
# other HTTP traffic to FastAPI. One ASGI app, both protocols, one port.
socket_app = socketio.ASGIApp(sio, app)


# ── In-memory sid → player mapping ────────────────────────────────────────────
connected: dict[str, dict] = {}  # sid → { room_code, player_id, player_name }


# ── HTTP Endpoints ─────────────────────────────────────────────────────────────


@app.post("/room/create")
async def create_room(body: CreateRoomRequest):
    code = "".join(random.choices(string.digits, k=6))
    while await state.room_exists(code):
        code = "".join(random.choices(string.digits, k=6))
    await state.create_room(code, body.player_id)
    return {"room_code": code}


@app.post("/room/join")
async def join_room_http(body: JoinRoomRequest):
    if not await state.room_exists(body.room_code):
        raise HTTPException(status_code=404, detail="Room not found")
    if await state.get_state(body.room_code) != "waiting":
        raise HTTPException(status_code=400, detail="Game already in progress")
    if await state.player_count(body.room_code) >= 4:
        raise HTTPException(status_code=400, detail="Room is full (max 4 players)")
    return {"status": "ok", "room_code": body.room_code}


@app.post("/room/game-ready")
async def game_ready(body: GameReadyRequest):
    """
    Called by Person 2's Celery task when AI content is written to Redis.
    Assigns the impostor, starts the game, and notifies all players.

    WHY HTTP AND NOT REDIS PUB/SUB:
    Person 2's Celery worker and this FastAPI server live in the same
    Railway service. An HTTP call to localhost is one line in Celery and
    one route here. Redis pub/sub requires a subscriber loop — more
    complexity for no benefit in a single-service deployment.

    SECURITY: the impostor_directive is NEVER sent in the game_start
    broadcast. It goes only to the impostor's private socket connection.
    All other players receive only the problem_statement.
    """
    room_code = body.room_code
    if not body.content:
        raise HTTPException(status_code=400, detail="No game content provided")
    await state.set_content(room_code, body.content)
    content = body.content

    players = await state.get_players(room_code)
    player_names = await state.get_player_names(room_code)
    impostor_id = await state.assign_impostor(room_code)

    await state.transition_state(room_code, "playing")

    # Broadcast problem to everyone — directive intentionally excluded
    await sio.emit(
        "game_start",
        {
            "problem_statement": content["problem_statement"],
            "players": players,
            "player_names": player_names,
        },
        room=room_code,
    )

    # Send directive privately to the impostor only
    impostor_sid = next(
        (sid for sid, d in connected.items() if d["player_id"] == impostor_id), None
    )
    if impostor_sid:
        await sio.emit(
            "impostor_directive",
            {"directive": content["impostor_directive"]},
            to=impostor_sid,
        )

    return {"status": "game started", "impostor": impostor_id}


@app.get("/room/state")
async def get_room_state(room_code: str):
    """Game page fetches this on mount/refresh to restore state from the server."""
    if not await state.room_exists(room_code):
        raise HTTPException(status_code=404, detail="Room not found")
    content = await state.get_content(room_code)
    return {
        "state": await state.get_state(room_code),
        "players": await state.get_players(room_code),
        "player_names": await state.get_player_names(room_code),
        "contributions": await state.get_contributions(room_code),
        "problem_statement": content.get("problem_statement", "") if content else "",
    }


@app.get("/room/directive")
async def get_directive(room_code: str, player_id: str):
    """
    Game page fetches this on mount to reliably get the impostor directive.
    The socket event (impostor_directive) fires right after game_start and
    can be missed during React page navigation. This endpoint is the fallback.
    """
    impostor = await state.get_impostor(room_code)
    if player_id != impostor:
        return {"is_impostor": False, "directive": None}
    content = await state.get_content(room_code)
    directive = content.get("impostor_directive", "") if content else ""
    return {"is_impostor": True, "directive": directive}


@app.post("/room/game-failed")
async def game_failed(body: GameFailedRequest):
    """Person 2 calls this if the AI pipeline errors. Resets the room."""
    room_code = body.room_code
    await state.transition_state(room_code, "waiting")
    await sio.emit(
        "error",
        {"message": "AI pipeline failed. Please try uploading again."},
        room=room_code,
    )
    return {"status": "reset"}


@app.post("/room/mock-start")
async def mock_start(body: MockStartRequest):
    """
    Skips AI ingestion — starts with hardcoded content immediately.
    Person 3 uses this from Hour 0 so they never wait for the real pipeline.

    WHY KEEP THIS IN PRODUCTION CODE AND NOT JUST LOCAL:
    If the AI pipeline is slow or fails during the demo, we can fall back
    to this and still show a working game to judges. Safety net, not just
    a dev shortcut.
    """
    room_code = body.room_code
    mock_content = {
        "problem_statement": (
            "You are all collaborating on a markdown document that explains "
            "how a hash table works. Cover: what it is, how insertion works, "
            "how lookup works, and how collision handling works."
        ),
        "impostor_directive": (
            "Describe lookup as always taking O(n) time regardless of load "
            "factor. Make it sound authoritative and blend it naturally into "
            "the explanation."
        ),
    }

    players = await state.get_players(room_code)
    if not players:
        raise HTTPException(status_code=400, detail="No players in room — join first")

    player_names = await state.get_player_names(room_code)
    await state.set_content(room_code, mock_content)
    impostor_id = await state.assign_impostor(room_code)
    current = await state.get_state(room_code)
    if current == "waiting":
        await state.transition_state(room_code, "ingesting")
    await state.transition_state(room_code, "playing")

    await sio.emit(
        "game_start",
        {
            "problem_statement": mock_content["problem_statement"],
            "players": players,
            "player_names": player_names,
        },
        room=room_code,
    )

    impostor_sid = next(
        (sid for sid, d in connected.items() if d["player_id"] == impostor_id), None
    )
    if impostor_sid:
        await sio.emit(
            "impostor_directive",
            {"directive": mock_content["impostor_directive"]},
            to=impostor_sid,
        )

    return {"status": "mock game started", "impostor": impostor_id}


async def run_ai_pipeline(room_code: str, saved_files: list):
    """
    Runs the full AI pipeline in a thread pool so blocking Gemini/file-IO
    calls don't stall the event loop. Replaces the Celery worker entirely —
    everything runs in-process, no BACKEND_URL round-trip needed.
    """
    try:
        def _pipeline():
            from ai_pipeline.extract import extract_text, chunk_text
            from ai_pipeline.gemini import (
                classify_and_build_search_prompt,
                gemini_search,
                generate_game,
            )
            all_chunks = []
            for f in saved_files:
                text = extract_text(f["path"], f["type"])
                all_chunks.extend(chunk_text(text, source=f["name"]))
            if not all_chunks:
                raise ValueError("No text extracted from uploaded files")
            classification = classify_and_build_search_prompt(all_chunks)
            research = gemini_search(
                search_prompt=classification["gemini_search_prompt"],
                subject=classification["subject"],
            )
            return generate_game(classification, research, 4)

        game_payload = await asyncio.to_thread(_pipeline)

        await state.set_content(room_code, game_payload)
        players = await state.get_players(room_code)
        player_names = await state.get_player_names(room_code)
        impostor_id = await state.assign_impostor(room_code)
        try:
            await state.transition_state(room_code, "playing")
        except ValueError:
            pass  # room already transitioned (e.g. host hit mock-start)

        await sio.emit(
            "game_start",
            {
                "problem_statement": game_payload["problem_statement"],
                "players": players,
                "player_names": player_names,
            },
            room=room_code,
        )
        impostor_sid = next(
            (sid for sid, d in connected.items() if d["player_id"] == impostor_id), None
        )
        if impostor_sid:
            await sio.emit(
                "impostor_directive",
                {"directive": game_payload["impostor_directive"]},
                to=impostor_sid,
            )

    except Exception as exc:
        print(f"[pipeline] Error for room {room_code}: {exc}")
        try:
            await state.transition_state(room_code, "waiting")
        except Exception:
            pass
        await sio.emit(
            "error",
            {"message": "AI pipeline failed. Please try uploading again."},
            room=room_code,
        )


@app.post("/upload")
async def upload_files(room_code: str, files: List[UploadFile] = File(...)):
    if not await state.room_exists(room_code):
        raise HTTPException(status_code=404, detail="Room not found")

    saved_files = []

    for file in files:
        ext = file.filename.split(".")[-1].lower()
        if ext not in {"pdf", "pptx", "docx", "md", "txt"}:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

        file_content = await file.read()
        if len(file_content) > 25 * 1024 * 1024:
            raise HTTPException(
                status_code=400, detail=f"{file.filename} exceeds 25MB limit"
            )

        temp_path = f"/tmp/{uuid.uuid4()}_{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(file_content)

        if files_col is not None:
            await files_col.insert_one(
                {
                    "room_code": room_code,
                    "file_name": file.filename,
                    "file_type": ext,
                    "temp_path": temp_path,
                    "uploaded_at": datetime.utcnow(),
                }
            )

        saved_files.append({"path": temp_path, "type": ext, "name": file.filename})

    if sessions_col is not None:
        await sessions_col.insert_one(
            {
                "room_code": room_code,
                "created_at": datetime.utcnow(),
                "winner": None,
                "ended_at": None,
            }
        )

    await state.transition_state(room_code, "ingesting")

    asyncio.create_task(run_ai_pipeline(room_code, saved_files))

    await sio.emit("upload_complete", {"room_code": room_code}, room=room_code)

    return {"status": "processing"}


@app.post("/room/restart")
async def restart_room(body: RestartRequest):
    """
    Resets a finished game so the same 4 players can play again.
    Rebuilds the player list from currently-connected sockets (avoids the
    problem where disconnect() removed players from Redis during game-over).
    Bypasses the FSM with a direct set because "ended" has no valid transitions.
    """
    room_code = body.room_code

    # Rebuild player list from live socket connections in this room
    current = [
        (d["player_id"], d["player_name"])
        for d in connected.values()
        if d["room_code"] == room_code
    ]

    await state.r.delete(f"room:{room_code}:players")
    await state.r.delete(f"room:{room_code}:player_names")
    await state.r.delete(f"room:{room_code}:contributions")
    await state.r.delete(f"room:{room_code}:votes")
    await state.r.delete(f"room:{room_code}:impostor")
    await state.r.delete(f"room:{room_code}:content")

    for pid, pname in current:
        await state.add_player(room_code, pid)
        await state.set_player_name(room_code, pid, pname)

    # Direct set — FSM doesn't allow ended → waiting
    await state.r.set(f"room:{room_code}:state", "waiting")

    await sio.emit("game_restart", {"room_code": room_code}, room=room_code)
    return {"status": "restarted", "players": len(current)}


# ── Socket.io Events ───────────────────────────────────────────────────────────


@sio.event
async def connect(sid, environ):
    # Auth happens in join_room, not here.
    pass


@sio.event
async def join_room(sid, data):
    """
    WHY SOCKET join_room IS SEPARATE FROM HTTP /room/join:
    The HTTP endpoint checks eligibility before the socket connects.
    This event does the actual socket room subscription after connection.
    They must be separate — you can't subscribe to a socket room over HTTP.

    WHY sio.enter_room AND NOT NAMESPACES:
    Namespaces separate logical apps (/chat vs /game).
    Rooms group connections within an app. Our use case — one room per
    game instance — is exactly what socket rooms are designed for.
    """
    room_code = data.get("room_code")
    player_id = data.get("player_id")
    player_name = data.get("player_name", player_id)

    if not await state.room_exists(room_code):
        # Auto-create the room if it wasn't pre-created via HTTP (e.g. CORS failure fallback)
        await state.create_room(room_code, player_id)
    if await state.player_count(room_code) >= 4:
        await sio.emit("error", {"message": "Room is full"}, to=sid)
        return

    await sio.enter_room(sid, room_code)
    connected[sid] = {
        "room_code": room_code,
        "player_id": player_id,
        "player_name": player_name,
    }

    existing = await state.get_players(room_code)
    if player_id not in existing:
        await state.add_player(room_code, player_id)
    await state.set_player_name(room_code, player_id, player_name)
    players = await state.get_players(room_code)
    player_names = await state.get_player_names(room_code)
    await sio.emit(
        "player_joined",
        {
            "players": players,
            "player_names": player_names,
            "player_id": player_id,
            "player_name": player_name,
        },
        room=room_code,
    )


@sio.event
async def submit_contribution(sid, data):
    """
    Player updates their section of the collaborative document.
    No turn gating — anyone can submit at any time during "playing".

    WHY NO SERVER-SIDE TURN VALIDATION:
    There are no turns. This is fully open collaboration. Any player
    can update their contribution slot at any time, just like editing
    a shared Google Doc. The only constraint is that each player has
    one slot (their playerID key in the hash) so they can't spam the feed.

    WHY BROADCAST THE FULL CONTRIBUTIONS MAP EACH TIME:
    The frontend needs the complete current state of all contributions
    to render the document correctly. Sending just the delta would
    require the frontend to maintain and merge state, which is more
    complex and more error-prone than just re-rendering from a fresh
    full snapshot on every update.
    """
    room_code = data.get("room_code")
    player_id = data.get("player_id")
    content = data.get("content", "").strip()

    if not content:
        return

    current_state = await state.get_state(room_code)
    if current_state != "playing":
        await sio.emit("error", {"message": "Game is not in playing state"}, to=sid)
        return

    await state.add_contribution(room_code, player_id, content)
    contributions = await state.get_contributions(room_code)

    # Broadcast the full updated contributions map to everyone in the room
    await sio.emit(
        "contribution_update",
        {
            "player_id": player_id,
            "contributions": contributions,  # full map, not just the delta
        },
        room=room_code,
    )


@sio.event
async def call_meeting(sid, data):
    """
    Any player can call an emergency meeting at any time during play.
    Freezes contributions and opens the voting phase.

    WHY FREEZE CONTRIBUTIONS DURING VOTING:
    If players can keep editing while voting, the impostor could try to
    clean up their sabotage mid-vote. Transitioning to "voting" state
    means submit_contribution will reject new submissions until voting
    resolves.
    """
    room_code = data.get("room_code")
    caller_id = data.get("caller_id")

    current = await state.get_state(room_code)
    if current != "playing":
        await sio.emit(
            "error", {"message": "Can only call a meeting during play"}, to=sid
        )
        return

    await state.transition_state(room_code, "voting")

    contributions = await state.get_contributions(room_code)
    await sio.emit(
        "meeting_called",
        {
            "caller_id": caller_id,
            "contributions_snapshot": contributions,
        },
        room=room_code,
    )

    # Server-side 60s deadline — auto-tally if not all votes arrive in time
    asyncio.create_task(_auto_tally(room_code))


@sio.event
async def cast_vote(sid, data):
    room_code = data.get("room_code")
    voter_id = data.get("voter_id")
    target_id = data.get("target_id")

    await state.add_vote(room_code, voter_id, target_id)

    # Tell everyone how many votes are in so the UI can show a progress indicator
    votes = await state.get_votes(room_code)
    players = await state.get_players(room_code)
    await sio.emit(
        "vote_progress",
        {
            "votes_in": len(votes),
            "total_players": len(players),
        },
        room=room_code,
    )

    if await state.all_votes_in(room_code):
        await tally_votes(room_code)


@sio.event
async def disconnect(sid, reason=None):
    # reason param required by newer python-socketio versions
    info = connected.pop(sid, None)
    if not info:
        return

    room_code = info["room_code"]
    player_id = info["player_id"]

    await state.remove_player(room_code, player_id)
    await sio.emit("player_left", {"player_id": player_id}, room=room_code)

    # Only apply game-over logic if a game is actually in progress
    current = await state.get_state(room_code)
    if current not in ("playing", "voting"):
        return

    impostor = await state.get_impostor(room_code)
    game_content = await state.get_content(room_code)
    directive = game_content.get("impostor_directive", "") if game_content else ""

    if player_id == impostor:
        await sio.emit(
            "game_over",
            {
                "winner": "players",
                "impostor_id": player_id,
                "impostor_directive": directive,
                "reason": "impostor_disconnected",
            },
            room=room_code,
        )
        await state.transition_state(room_code, "ended")
        return

    remaining = await state.get_players(room_code)
    if len(remaining) <= 1:
        await sio.emit(
            "game_over",
            {
                "winner": "impostor",
                "impostor_id": impostor,
                "impostor_directive": directive,
            },
            room=room_code,
        )
        await state.transition_state(room_code, "ended")


# ── Vote resolution ────────────────────────────────────────────────────────────


async def _auto_tally(room_code: str):
    """Force-tally after 60 s so a game never hangs on a missing vote."""
    await asyncio.sleep(60)
    if await state.get_state(room_code) == "voting":
        await tally_votes(room_code)


async def tally_votes(room_code: str):
    """
    WHY A PLAIN ASYNC FUNCTION AND NOT A SOCKET EVENT:
    This is called internally after all votes arrive — clients don't
    trigger it directly. Exposing it as a socket event would let any
    client force an early tally. Internal logic stays internal.
    """
    votes = await state.get_votes(room_code)

    tally: dict[str, int] = {}
    for target in votes.values():
        tally[target] = tally.get(target, 0) + 1

    max_votes = max(tally.values())
    top = [p for p, v in tally.items() if v == max_votes]

    await state.clear_votes(room_code)

    # Tie — no elimination, resume collaboration
    if len(top) > 1:
        await sio.emit(
            "vote_result",
            {
                "eliminated_id": None,
                "was_impostor": False,
                "impostor_directive": None,
                "votes": tally,
                "tie": True,
            },
            room=room_code,
        )
        await state.transition_state(room_code, "playing")
        return

    eliminated = top[0]
    impostor = await state.get_impostor(room_code)
    was_impostor = eliminated == impostor

    content = await state.get_content(room_code)
    directive = content.get("impostor_directive", "") if content else ""

    await sio.emit(
        "vote_result",
        {
            "eliminated_id": eliminated,
            "was_impostor": was_impostor,
            "impostor_directive": directive,
            "votes": tally,
            "tie": False,
        },
        room=room_code,
    )

    if was_impostor:
        await state.transition_state(room_code, "ended")
        await sio.emit(
            "game_over",
            {
                "winner": "players",
                "impostor_id": impostor,
                "impostor_directive": directive,
            },
            room=room_code,
        )
        if sessions_col:
            from datetime import datetime

            await sessions_col.update_one(
                {"room_code": room_code},
                {"$set": {"winner": "players", "ended_at": datetime.utcnow()}},
            )
    else:
        await state.remove_player(room_code, eliminated)
        await sio.emit("elimination", {"player_id": eliminated}, room=room_code)

        remaining = await state.get_players(room_code)
        if len(remaining) <= 1:
            await state.transition_state(room_code, "ended")
            await sio.emit(
                "game_over",
                {
                    "winner": "impostor",
                    "impostor_id": impostor,
                    "impostor_directive": directive,
                },
                room=room_code,
            )
            if sessions_col:
                from datetime import datetime

                await sessions_col.update_one(
                    {"room_code": room_code},
                    {"$set": {"winner": "impostor", "ended_at": datetime.utcnow()}},
                )
        else:
            # Wrong person eliminated — resume collaboration
            await state.transition_state(room_code, "playing")
