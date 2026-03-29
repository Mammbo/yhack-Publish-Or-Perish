# Person 1 — Backend & Real-Time Infrastructure

**Own:** FastAPI server, Socket.io room management, Redis game state, Celery task queue

**You are the critical path.** The WebSocket state machine must be functional by Hour 10 so Person 3 can build UI against real events and Person 2 can test AI output flowing into actual game state. If this slips, everyone blocks.

Expose a `/room/mock-start` endpoint early that skips ingestion and emits `game_start` with hardcoded content so Person 3 never waits on you.

---

## How Your Piece Fits

```
Person 4 (upload) → triggers Celery task
Person 2 (AI)     → writes game content to Redis → calls your callback
Person 1 (you)    → runs state machine, emits socket events
Person 3 (UI)     → listens to your socket events, renders game
```

You are the hub. Everyone talks through you.

---

## Stack

| Tech | Role | Docs |
|---|---|---|
| FastAPI | Async HTTP + ASGI server | https://fastapi.tiangolo.com/ |
| python-socketio | Socket.io server mounted on FastAPI | https://python-socketio.readthedocs.io/en/stable/ |
| Redis | Ephemeral game state (TTL-based, evaporates after game ends) | https://redis.io/docs/latest/develop/data-types/ |
| Celery | Background task queue — Person 2's AI jobs run here | https://docs.celeryq.dev/en/stable/ |
| Motor | Async MongoDB driver — used by Person 4, you read session data from it | https://motor.readthedocs.io/en/stable/ |
| Railway | Hosts FastAPI + Redis add-on | https://docs.railway.com/ |
| Uvicorn | ASGI server that runs FastAPI | https://www.uvicorn.org/ |

---

## Hours 0–4: Foundation

### 1. Scaffold FastAPI + python-socketio

Mount Socket.io as an ASGI sub-app inside FastAPI so both run in the same process.

**Docs:** https://python-socketio.readthedocs.io/en/stable/server.html#using-as-an-asgi-application

```python
import socketio
from fastapi import FastAPI

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
app = FastAPI()
socket_app = socketio.ASGIApp(sio, app)
# Run with: uvicorn main:socket_app --reload
```

### 2. Connect Redis

Railway's Redis add-on injects `REDIS_URL` automatically into your service environment.

**redis-py async docs:** https://redis-py.readthedocs.io/en/stable/

```python
import redis.asyncio as aioredis
import os

r = aioredis.from_url(os.environ["REDIS_URL"], decode_responses=True)
```

### 3. Room Create & Join Endpoints

**FastAPI path operations:** https://fastapi.tiangolo.com/tutorial/path-operation-configuration/

| Endpoint | What it does |
|---|---|
| `POST /room/create` | Generates 6-digit code, writes initial Redis keys, returns code |
| `POST /room/join` | Validates code exists, checks max 4 players, appends playerID |

```python
import random, string, json
from fastapi import FastAPI, HTTPException

@app.post("/room/create")
async def create_room(host_id: str):
    code = "".join(random.choices(string.digits, k=6))
    await r.set(f"room:{code}:state", "waiting")
    await r.rpush(f"room:{code}:players", host_id)
    await r.expire(f"room:{code}:state", 86400)  # 24hr TTL
    return {"room_code": code}

@app.post("/room/join")
async def join_room(room_code: str, player_id: str):
    state = await r.get(f"room:{room_code}:state")
    if not state:
        raise HTTPException(status_code=404, detail="Room not found")
    if state != "waiting":
        raise HTTPException(status_code=400, detail="Game already started")
    count = await r.llen(f"room:{room_code}:players")
    if count >= 4:
        raise HTTPException(status_code=400, detail="Room is full")
    await r.rpush(f"room:{room_code}:players", player_id)
    return {"status": "joined"}
```

### 4. Redis Schema

All live game state lives under `room:{code}:*`. This is the single source of truth during a game. MongoDB (Person 4) stores the persistent record after the game ends.

**Redis data types:** https://redis.io/docs/latest/develop/data-types/
**Redis EXPIRE/TTL:** https://redis.io/docs/latest/commands/expire/

| Key | Redis type | Purpose |
|---|---|---|
| `room:{code}:state` | String | FSM state: `waiting \| ingesting \| playing \| voting \| ended` |
| `room:{code}:players` | List | Ordered playerIDs — `RPUSH` to add, `LRANGE 0 -1` to read |
| `room:{code}:impostor` | String | The sabotaging playerID — set when game starts |
| `room:{code}:content` | String | JSON from Person 2's AI pipeline: problem + impostor directive |
| `room:{code}:contributions` | Hash | `playerID → contribution text` |
| `room:{code}:turn` | String | playerID whose turn it is |
| `room:{code}:votes` | Hash | `playerID → votedForID` |
| `room:{code}:timer` | String + TTL | `SETEX room:{code}:timer 60 1` — expires to signal time's up |

---

## Hours 4–10: WebSocket Event System

Socket.io rooms map 1:1 to game rooms. All events are scoped — players in `123456` never receive events from `789012`.

**python-socketio event handlers:** https://python-socketio.readthedocs.io/en/stable/server.html#defining-event-handlers
**python-socketio emit to room:** https://python-socketio.readthedocs.io/en/stable/server.html#emitting-events
**Socket.io rooms concept:** https://socket.io/docs/v4/rooms/

### Inbound Events (client → server)

| Event | Payload | Action |
|---|---|---|
| `join_room` | `{ room_code, player_id, player_name }` | Enter sio room, push to Redis players list, emit `player_joined` |
| `upload_complete` | `{ room_code }` | Transition `waiting → ingesting` |
| `submit_contribution` | `{ room_code, player_id, content }` | Write to contributions hash, emit `contribution_update`, advance turn |
| `call_meeting` | `{ room_code, caller_id }` | Transition `playing → voting`, emit `meeting_called` |
| `cast_vote` | `{ room_code, voter_id, target_id }` | Write to votes hash, tally if all votes in |

### Outbound Events (server → clients)

| Event | Payload | When |
|---|---|---|
| `player_joined` | `{ players: [...] }` | Any player joins — broadcast full updated list |
| `game_start` | `{ problem_statement, players, first_turn }` | AI done, content in Redis — **never send impostor_directive here** |
| `impostor_directive` | `{ directive }` | Sent privately to the impostor's socket only |
| `contribution_update` | `{ player_id, content, contributions_so_far }` | After each submission — broadcast to whole room |
| `turn_update` | `{ current_player_id, time_remaining }` | On turn change |
| `meeting_called` | `{ caller_id }` | When `call_meeting` fires |
| `vote_result` | `{ eliminated_id, was_impostor, impostor_directive, votes }` | Votes tallied — reveal directive to everyone |
| `elimination` | `{ player_id }` | Player removed |
| `game_over` | `{ winner: "players \| impostor", impostor_id, impostor_directive }` | Win condition met |

```python
# Track sid → player info so disconnect events know which room to clean up
connected_players = {}  # sid → { room_code, player_id }

@sio.event
async def join_room(sid, data):
    room_code = data["room_code"]
    player_id = data["player_id"]
    await sio.enter_room(sid, room_code)
    connected_players[sid] = {"room_code": room_code, "player_id": player_id}
    await r.rpush(f"room:{room_code}:players", player_id)
    players = await r.lrange(f"room:{room_code}:players", 0, -1)
    await sio.emit("player_joined", {"players": players}, room=room_code)

@sio.event
async def submit_contribution(sid, data):
    room_code = data["room_code"]
    await r.hset(f"room:{room_code}:contributions", data["player_id"], data["content"])
    contributions = await r.hgetall(f"room:{room_code}:contributions")
    await sio.emit("contribution_update", {
        "player_id": data["player_id"],
        "content": data["content"],
        "contributions_so_far": contributions
    }, room=room_code)
    await advance_turn(room_code)

@sio.event
async def cast_vote(sid, data):
    room_code = data["room_code"]
    await r.hset(f"room:{room_code}:votes", data["voter_id"], data["target_id"])
    total_players = await r.llen(f"room:{room_code}:players")
    total_votes = await r.hlen(f"room:{room_code}:votes")
    if total_votes >= total_players:
        await tally_votes(room_code)

@sio.event
async def disconnect(sid):
    info = connected_players.pop(sid, None)
    if info:
        room_code = info["room_code"]
        player_id = info["player_id"]
        await r.lrem(f"room:{room_code}:players", 0, player_id)
        impostor = await r.get(f"room:{room_code}:impostor")
        if player_id == impostor:
            await sio.emit("game_over", {"winner": "players", "reason": "impostor_disconnected"}, room=room_code)
```

### Turn Rotation

```python
async def advance_turn(room_code: str):
    players = await r.lrange(f"room:{room_code}:players", 0, -1)
    current = await r.get(f"room:{room_code}:turn")
    idx = players.index(current) if current in players else -1
    next_player = players[(idx + 1) % len(players)]
    await r.set(f"room:{room_code}:turn", next_player)
    await sio.emit("turn_update", {"current_player_id": next_player}, room=room_code)
    await start_timer(room_code)
```

### Timer

**Redis SETEX:** https://redis.io/docs/latest/commands/setex/
**asyncio tasks:** https://docs.python.org/3/library/asyncio-task.html

```python
async def start_timer(room_code: str, seconds: int = 60):
    await r.setex(f"room:{room_code}:timer", seconds, 1)
    asyncio.create_task(watch_timer(room_code))

async def watch_timer(room_code: str):
    while True:
        await asyncio.sleep(1)
        exists = await r.exists(f"room:{room_code}:timer")
        if not exists:
            await advance_turn(room_code)
            break
```

---

## Hours 10–16: Game State Machine

```
waiting → ingesting → playing → voting → playing → ended
```

| Transition | Trigger |
|---|---|
| `waiting → ingesting` | `upload_complete` received |
| `ingesting → playing` | Person 2's Celery task done, content in Redis |
| `playing → voting` | `call_meeting` fired |
| `voting → playing` | Vote resolved, no winner yet |
| `playing → ended` | Win condition met |

```python
VALID_TRANSITIONS = {
    "waiting":   ["ingesting"],
    "ingesting": ["playing"],
    "playing":   ["voting", "ended"],
    "voting":    ["playing", "ended"],
    "ended":     [],
}

async def transition_state(room_code: str, new_state: str):
    current = (await r.get(f"room:{room_code}:state")) or "waiting"
    if new_state not in VALID_TRANSITIONS.get(current, []):
        raise ValueError(f"Invalid transition: {current} → {new_state}")
    await r.set(f"room:{room_code}:state", new_state)
```

### Vote Tallying + Reveal

```python
async def tally_votes(room_code: str):
    votes = await r.hgetall(f"room:{room_code}:votes")
    tally = {}
    for target in votes.values():
        tally[target] = tally.get(target, 0) + 1

    # Tie = no elimination, resume game
    max_votes = max(tally.values())
    top = [p for p, v in tally.items() if v == max_votes]
    if len(top) > 1:
        await r.delete(f"room:{room_code}:votes")
        await transition_state(room_code, "playing")
        return

    eliminated = top[0]
    impostor = await r.get(f"room:{room_code}:impostor")
    was_impostor = (eliminated == impostor)
    content = json.loads(await r.get(f"room:{room_code}:content"))
    directive = content.get("impostor_directive", "")

    await r.delete(f"room:{room_code}:votes")
    await sio.emit("vote_result", {
        "eliminated_id": eliminated,
        "was_impostor": was_impostor,
        "impostor_directive": directive,
        "votes": tally
    }, room=room_code)

    if was_impostor:
        await transition_state(room_code, "ended")
        await sio.emit("game_over", {
            "winner": "players",
            "impostor_id": impostor,
            "impostor_directive": directive
        }, room=room_code)
    else:
        await r.lrem(f"room:{room_code}:players", 0, eliminated)
        await sio.emit("elimination", {"player_id": eliminated}, room=room_code)
        players = await r.lrange(f"room:{room_code}:players", 0, -1)
        if len(players) <= 1:
            await transition_state(room_code, "ended")
            await sio.emit("game_over", {"winner": "impostor", "impostor_id": impostor, "impostor_directive": directive}, room=room_code)
        else:
            await transition_state(room_code, "playing")
```

### Edge Cases

| Scenario | Handling |
|---|---|
| Player disconnects | Remove from Redis list, if impostor → players win immediately |
| Vote tie | Clear votes, resume playing — no elimination |
| 2 players left, impostor still in | Impostor wins |
| Celery task fails | Person 2 emits error → you reset state to `waiting`, emit `error` event to room |

---

## Hours 16–24: Integration

### Contract with Person 2

Person 2's Celery task writes this JSON to `room:{code}:content` when done:

```json
{
  "problem_statement": "string — shown to all players",
  "impostor_directive": "string — shown only to the impostor",
  "contribution_slots": 4
}
```

After Person 2 writes content, they call `POST /room/game-ready?room_code=...` on your server. You then:

1. Read `room:{code}:content` from Redis
2. Pick a random playerID from the players list → set as `room:{code}:impostor`
3. Transition `ingesting → playing`
4. Emit `game_start` to the room (problem only — no directive)
5. Emit `impostor_directive` privately to the impostor's sid only

```python
@app.post("/room/game-ready")
async def game_ready(room_code: str):
    players = await r.lrange(f"room:{room_code}:players", 0, -1)
    impostor_id = random.choice(players)
    await r.set(f"room:{room_code}:impostor", impostor_id)
    content = json.loads(await r.get(f"room:{room_code}:content"))
    await transition_state(room_code, "playing")
    await r.set(f"room:{room_code}:turn", players[0])
    await sio.emit("game_start", {
        "problem_statement": content["problem_statement"],
        "players": players,
        "first_turn": players[0]
    }, room=room_code)
    # Send directive privately to impostor only
    impostor_sid = next((s for s, d in connected_players.items() if d["player_id"] == impostor_id), None)
    if impostor_sid:
        await sio.emit("impostor_directive", {"directive": content["impostor_directive"]}, to=impostor_sid)
    return {"status": "game started"}
```

### Mock Endpoint for Person 3

Expose this before Hour 6 so Person 3 never waits:

```python
@app.post("/room/mock-start")
async def mock_start(room_code: str):
    mock_content = {
        "problem_statement": "Implement a binary search function. It should return the index of the target or -1 if not found.",
        "impostor_directive": "Your implementation should fail when the target is the last element in the array.",
        "contribution_slots": 4
    }
    players = await r.lrange(f"room:{room_code}:players", 0, -1)
    if not players:
        players = ["player_1", "player_2", "player_3", "player_4"]
        for p in players:
            await r.rpush(f"room:{room_code}:players", p)
    await r.set(f"room:{room_code}:content", json.dumps(mock_content))
    await r.set(f"room:{room_code}:impostor", players[-1])
    await transition_state(room_code, "playing")
    await r.set(f"room:{room_code}:turn", players[0])
    await sio.emit("game_start", {
        "problem_statement": mock_content["problem_statement"],
        "players": players,
        "first_turn": players[0]
    }, room=room_code)
    return {"status": "mock game started"}
```

---

## Project Setup

```bash
pip install fastapi uvicorn python-socketio "redis[asyncio]" celery motor python-dotenv

# .env
REDIS_URL=redis://...
MONGODB_URI=mongodb+srv://...

# Run
uvicorn main:socket_app --reload --port 8000
```

**FastAPI project structure:** https://fastapi.tiangolo.com/tutorial/bigger-applications/
