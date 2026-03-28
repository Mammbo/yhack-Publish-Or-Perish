# Person 1 — Backend & Real-Time Infrastructure

**Own:** FastAPI server, Socket.io room management, Redis game state, Celery task queue

**You are the critical path.** The WebSocket state machine must be functional by Hour 10 so Person 3 can build UI against real events and Person 2 can test AI output flowing into actual game state. If this slips, everyone blocks.

Expose a `/room/mock-start` endpoint early that skips ingestion and emits `game_start` with hardcoded content so Person 3 never waits on you.

---

## Stack & Reference Docs

| Tech | Role | Docs |
|---|---|---|
| FastAPI | Async HTTP + ASGI server | https://fastapi.tiangolo.com/ |
| python-socketio | Socket.io server mounted on FastAPI | https://python-socketio.readthedocs.io/en/stable/ |
| Redis | Ephemeral game state store | https://redis.io/docs/latest/develop/data-types/ |
| Celery | Background task queue for AI jobs | https://docs.celeryq.dev/en/stable/ |
| Railway | Hosting for FastAPI + Redis add-on | https://docs.railway.com/ |

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

**Uvicorn docs:** https://www.uvicorn.org/

### 2. Connect Redis

Railway's Redis add-on injects `REDIS_URL` automatically into your service's environment.

**Railway Redis docs:** https://docs.railway.com/databases/redis
**redis-py docs:** https://redis-py.readthedocs.io/en/stable/

```python
import redis.asyncio as redis
import os

r = redis.from_url(os.environ["REDIS_URL"])
```

### 3. REST Endpoints — Room Create & Join

Plain HTTP, no sockets needed here.

**FastAPI path operations docs:** https://fastapi.tiangolo.com/tutorial/path-operation-configuration/

| Endpoint | What it does |
|---|---|
| `POST /room/create` | Generates a random 6-digit code, writes initial Redis keys, returns code |
| `POST /room/join` | Validates the code exists in Redis, appends playerID to players list |

```python
import random, string

@app.post("/room/create")
async def create_room():
    code = "".join(random.choices(string.digits, k=6))
    await r.set(f"room:{code}:state", "waiting")
    await r.expire(f"room:{code}:state", 86400)  # 24hr TTL
    return {"room_code": code}

@app.post("/room/join")
async def join_room(room_code: str, player_id: str):
    state = await r.get(f"room:{room_code}:state")
    if not state:
        raise HTTPException(status_code=404, detail="Room not found")
    count = await r.llen(f"room:{room_code}:players")
    if count >= 4:
        raise HTTPException(status_code=400, detail="Room is full")
    await r.rpush(f"room:{room_code}:players", player_id)
    return {"status": "joined"}
```

### 4. Redis Schema

All game state lives under `room:{code}:*` keys.

**Redis data types reference:** https://redis.io/docs/latest/develop/data-types/
**Redis TTL/EXPIRE docs:** https://redis.io/docs/latest/commands/expire/

| Key | Redis type | Purpose |
|---|---|---|
| `room:{code}:state` | String | FSM state: `waiting \| ingesting \| playing \| voting \| ended` |
| `room:{code}:players` | List | Ordered playerIDs — `RPUSH` to add, `LRANGE 0 -1` to read |
| `room:{code}:impostor` | String | The one sabotaging playerID — set when game starts |
| `room:{code}:content` | String | Serialized JSON from Person 2's AI pipeline (problem + impostor directive) |
| `room:{code}:contributions` | Hash | `playerID → contribution text` — `HSET` / `HGETALL` |
| `room:{code}:turn` | String | playerID whose turn it currently is |
| `room:{code}:votes` | Hash | `playerID → votedForID` |
| `room:{code}:timer` | String + TTL | `SETEX room:{code}:timer 60 1` — expires to signal time's up |

---

## Hours 4–10: WebSocket Event System

Socket.io rooms map 1:1 to game rooms. All events are scoped to a room — players in `123456` never receive events from `789012`.

**python-socketio event handlers:** https://python-socketio.readthedocs.io/en/stable/server.html#defining-event-handlers
**python-socketio emit to room:** https://python-socketio.readthedocs.io/en/stable/server.html#emitting-events
**Socket.io rooms concept:** https://socket.io/docs/v4/rooms/

### Inbound Events (client → server)

| Event | Payload | What to do |
|---|---|---|
| `join_room` | `{ room_code, player_id, player_name }` | Add to sio room, update Redis players list, emit `player_joined` to room |
| `upload_complete` | `{ room_code }` | Transition `waiting → ingesting`, Celery task already kicked off by Person 4's upload endpoint |
| `submit_contribution` | `{ room_code, player_id, content }` | Write to `room:{code}:contributions` hash, emit `contribution_update`, advance turn |
| `call_meeting` | `{ room_code, caller_id }` | Transition `playing → voting`, emit `meeting_called` to all |
| `cast_vote` | `{ room_code, voter_id, target_id }` | Write to `room:{code}:votes` hash, check if all votes in, tally if so |

### Outbound Events (server → clients)

| Event | Payload | When |
|---|---|---|
| `player_joined` | `{ players: [...] }` | After any player joins — broadcast full updated list |
| `game_start` | `{ problem_statement, players, first_turn }` | When AI pipeline finishes and content is in Redis |
| `contribution_update` | `{ player_id, content, contributions_so_far }` | After each `submit_contribution` — broadcast to whole room |
| `turn_update` | `{ current_player_id, time_remaining }` | On turn change or timer tick |
| `meeting_called` | `{ caller_id }` | When `call_meeting` fires |
| `vote_result` | `{ eliminated_id, was_impostor, impostor_directive, votes }` | After all votes tallied — reveal the directive on screen |
| `elimination` | `{ player_id }` | Broadcast player removal |
| `game_over` | `{ winner: "players \| impostor", impostor_id, impostor_directive }` | Win condition met |

```python
@sio.event
async def join_room(sid, data):
    room_code = data["room_code"]
    await sio.enter_room(sid, room_code)
    await r.rpush(f"room:{room_code}:players", data["player_id"])
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

### Timer (Redis TTL)

**Redis SETEX docs:** https://redis.io/docs/latest/commands/setex/
**asyncio tasks docs:** https://docs.python.org/3/library/asyncio-task.html

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

**Python enum docs:** https://docs.python.org/3/library/enum.html

```
waiting → ingesting → playing → voting → playing → ended
```

| Transition | Trigger |
|---|---|
| `waiting → ingesting` | `upload_complete` received |
| `ingesting → playing` | Celery task done, content written to Redis |
| `playing → voting` | `call_meeting` fired |
| `voting → playing` | Vote resolved, no win condition yet |
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

When votes are resolved, include the impostor's hidden directive in the payload so Person 3 can show it on the reveal screen.

```python
async def tally_votes(room_code: str):
    votes = await r.hgetall(f"room:{room_code}:votes")
    tally = {}
    for target in votes.values():
        tally[target] = tally.get(target, 0) + 1
    eliminated = max(tally, key=tally.get)
    impostor = await r.get(f"room:{room_code}:impostor")
    was_impostor = (eliminated == impostor)

    # Get impostor directive from content JSON
    content = json.loads(await r.get(f"room:{room_code}:content"))
    directive = content.get("impostor_directive", "")

    await sio.emit("vote_result", {
        "eliminated_id": eliminated,
        "was_impostor": was_impostor,
        "impostor_directive": directive,
        "votes": tally
    }, room=room_code)
    await r.delete(f"room:{room_code}:votes")

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
        await transition_state(room_code, "playing")
```

### Edge Cases

| Scenario | Handling |
|---|---|
| Player disconnects mid-game | `disconnect` event → remove from Redis players list → if impostor disconnects, end game |
| Vote tie | No elimination — clear votes and resume playing |
| Only 2 players left, impostor still in | Impostor wins — trigger `game_over` with `winner: "impostor"` |
| Celery task fails | Emit error to room, reset state to `waiting` |

```python
@sio.event
async def disconnect(sid):
    # requires tracking sid → (room_code, player_id) in a local dict
    pass
```

---

## Hours 16–24: Integration

### With Person 2

Person 2's Celery task writes finalized game JSON to `room:{code}:content`. The JSON shape:

```json
{
  "problem_statement": "...",
  "impostor_directive": "...",
  "contribution_slots": 4
}
```

When that write happens, Person 2 should trigger a callback or you poll for it. Then:
1. Set `room:{code}:impostor` to the assigned playerID
2. Transition `ingesting → playing`
3. Emit `game_start` with `problem_statement` (NOT `impostor_directive` — that's secret)

**Celery result backend docs:** https://docs.celeryq.dev/en/stable/userguide/tasks.html#task-result-backends

### With Person 3

Person 3 needs stable event names and consistent payload shapes after Hour 10. Provide a `/room/mock-start` endpoint early:

```python
@app.post("/room/mock-start")
async def mock_start(room_code: str):
    mock_content = {
        "problem_statement": "Implement a function that returns the nth Fibonacci number.",
        "impostor_directive": "Your implementation should fail for inputs greater than 20.",
        "contribution_slots": 4
    }
    await r.set(f"room:{room_code}:content", json.dumps(mock_content))
    players = await r.lrange(f"room:{room_code}:players", 0, -1)
    await r.set(f"room:{room_code}:impostor", players[-1] if players else "mock_impostor")
    await transition_state(room_code, "playing")
    await sio.emit("game_start", {
        "problem_statement": mock_content["problem_statement"],
        "players": players,
        "first_turn": players[0] if players else None
    }, room=room_code)
    return {"status": "mock game started"}
```

### Stress Testing

Open multiple browser tabs in different rooms. Verify:
- Redis keys scoped correctly — room `111111` never bleeds into `222222`
- Socket.io rooms isolated — events in room A don't fire in room B
- Concurrent votes in two rooms resolve independently

**python-socketio testing docs:** https://python-socketio.readthedocs.io/en/stable/server.html#testing

---

## Project Setup

```bash
pip install fastapi uvicorn python-socketio redis celery python-dotenv

# .env
REDIS_URL=redis://...
SUPABASE_URL=...
SUPABASE_KEY=...

# Run
uvicorn main:socket_app --reload --port 8000
```

**FastAPI project structure:** https://fastapi.tiangolo.com/tutorial/bigger-applications/
