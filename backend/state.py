"""
state.py — All Redis read/write logic for game state.

WHY THIS IS ITS OWN MODULE AND NOT INLINE IN main.py:
Both HTTP handlers (room/create, room/join) and socket event handlers
(join_room, cast_vote, etc.) need to read and write game state. If all
Redis logic lived in main.py, the file would be 600+ lines and
untestable. Separating state operations here means:
  1. main.py only wires events to handlers — no business logic
  2. Any function here can be unit tested by mocking `r`
  3. Person 4 can import helpers like get_players() without touching main.py

WHY FUNCTIONS INSTEAD OF A CLASS:
You could wrap all of this in a GameRoom class that holds room_code.
Counter-argument: a class would require instantiation per request/event,
passing it around, or storing instances somewhere. Since Redis is the
real state store and room_code is just a string key prefix, free functions
that take room_code as a parameter are simpler and equally correct.
There's no object lifecycle to manage.

NOTE — NO TURNS:
This game is fully collaborative. All players see the same problem and
contribute freely at any time. There is no turn order, no per-turn timer,
and no "whose turn is it" concept. The impostor is just another player
whose contributions are secretly guided by a wrong directive.
"""

import json
import random
from redis_client import r


# ── State machine ──────────────────────────────────────────────────────────────

# WHY A DICT AND NOT AN ENUM OR CLASS:
# An enum would give us type safety on state names but adds boilerplate
# everywhere (GameState.PLAYING instead of "playing"). Since these strings
# go directly into Redis and back out into socket payloads that the
# frontend reads, plain strings are the right representation.
# The dict enforces valid transitions — the only invariant we need to protect.
VALID_TRANSITIONS = {
    "waiting":   ["ingesting"],
    "ingesting": ["playing"],
    "playing":   ["voting", "ended"],
    "voting":    ["playing", "ended"],
    "ended":     [],
}


async def get_state(room_code: str) -> str:
    # Default to "waiting" if key doesn't exist yet — handles the brief
    # window between room creation and the first state write.
    return await r.get(f"room:{room_code}:state") or "waiting"


async def transition_state(room_code: str, new_state: str):
    """
    Enforces the FSM. Raises ValueError on invalid transitions so callers
    know immediately if game logic is broken rather than silently
    corrupting state.

    WHY RAISE INSTEAD OF SILENTLY IGNORE:
    Silent failures here would mean a player gets stuck in a state they
    can't leave. Loud errors during development are much cheaper to fix
    than silent bugs discovered during the demo.
    """
    current = await get_state(room_code)
    if new_state not in VALID_TRANSITIONS.get(current, []):
        raise ValueError(f"Invalid transition: {current} → {new_state}")
    await r.set(f"room:{room_code}:state", new_state)


# ── Room helpers ───────────────────────────────────────────────────────────────

async def create_room(room_code: str, host_id: str):
    """
    Initializes Redis keys for a new room.

    WHY 24HR TTL ON ROOM KEYS:
    Games that never finish (players quit, crash) would otherwise leave
    orphaned Redis keys forever. A 24-hour TTL guarantees cleanup.
    We only TTL :state and :players — if :state expires the room is
    effectively gone and join attempts will correctly return 404.
    """
    await r.set(f"room:{room_code}:state", "waiting")
    await r.rpush(f"room:{room_code}:players", host_id)
    await r.expire(f"room:{room_code}:state", 86400)
    await r.expire(f"room:{room_code}:players", 86400)


async def get_players(room_code: str) -> list[str]:
    # LRANGE 0 -1 returns the full list in insertion order.
    # WHY A LIST AND NOT A SET: insertion order is useful for display
    # (show players in join order). Redis Sets have no order guarantee.
    return await r.lrange(f"room:{room_code}:players", 0, -1)


async def add_player(room_code: str, player_id: str):
    await r.rpush(f"room:{room_code}:players", player_id)


async def remove_player(room_code: str, player_id: str):
    # LREM count=0 removes ALL occurrences of the value.
    # A player_id should only appear once but 0 is safer than 1.
    await r.lrem(f"room:{room_code}:players", 0, player_id)


async def room_exists(room_code: str) -> bool:
    # Checking :state key is sufficient — it's the first key written on
    # room creation and the last to expire.
    return bool(await r.exists(f"room:{room_code}:state"))


async def player_count(room_code: str) -> int:
    return await r.llen(f"room:{room_code}:players")


async def set_player_name(room_code: str, player_id: str, name: str):
    await r.hset(f"room:{room_code}:player_names", player_id, name)


async def get_player_names(room_code: str) -> dict:
    return await r.hgetall(f"room:{room_code}:player_names")


# ── Content (AI-generated game payload) ───────────────────────────────────────

async def set_content(room_code: str, content: dict):
    """
    Stores Person 2's AI output as a JSON string.

    WHY STORE AS JSON STRING AND NOT A REDIS HASH:
    The content is a nested dict (problem_statement, impostor_directive).
    Flattening a nested structure into a Redis hash is messy and adds
    serialization complexity. One JSON string is read/written atomically
    and trivially deserialized. Written once, read a handful of times —
    there's no performance argument for a hash here.
    """
    await r.set(f"room:{room_code}:content", json.dumps(content))


async def get_content(room_code: str) -> dict | None:
    raw = await r.get(f"room:{room_code}:content")
    return json.loads(raw) if raw else None


async def assign_impostor(room_code: str) -> str:
    """
    Randomly picks one player as the impostor and stores their ID.

    WHY RANDOM AND NOT SOME FAIRNESS ALGORITHM:
    For a hackathon game, pure random is fine. A fairness system that
    tracks who has been impostor across games would require persistent
    history — overkill.

    WHY THIS RUNS ON PERSON 1'S SIDE AND NOT PERSON 2'S:
    Person 2 generates the directive but shouldn't know which player
    receives it — that's game logic, not AI logic. Person 1 assigns the
    impostor after content is ready, then privately sends the directive
    to only that player's socket connection.
    """
    players = await get_players(room_code)
    impostor_id = random.choice(players)
    await r.set(f"room:{room_code}:impostor", impostor_id)
    return impostor_id


async def get_impostor(room_code: str) -> str | None:
    return await r.get(f"room:{room_code}:impostor")


# ── Contributions ──────────────────────────────────────────────────────────────

async def add_contribution(room_code: str, player_id: str, content: str):
    """
    Stores a player's contribution. Any player can call this at any time
    during the "playing" state — there is no turn gating.

    WHY A HASH (playerID → text) AND NOT A LIST:
    A hash gives O(1) lookup by playerID and naturally prevents a player
    from flooding the feed — HSET overwrites their previous contribution
    rather than appending a duplicate. Each player has one contribution
    slot that they can update freely as the collaboration evolves.

    WHY ONE SLOT PER PLAYER AND NOT UNLIMITED SUBMISSIONS:
    The game UI shows one contribution per player clearly attributed.
    Unlimited submissions would make the feed noisy and harder for players
    to track who said what. One slot per player forces each person to
    commit to a position, which is more interesting for the impostor mechanic.
    """
    await r.hset(f"room:{room_code}:contributions", player_id, content)


async def get_contributions(room_code: str) -> dict:
    # Returns { playerID: contributionText } for all players who have submitted
    return await r.hgetall(f"room:{room_code}:contributions")


# ── Votes ──────────────────────────────────────────────────────────────────────

async def add_vote(room_code: str, voter_id: str, target_id: str):
    """
    WHY A HASH (voterID → targetID) AND NOT A SORTED SET OR LIST:
    We need to:
      1. Prevent double-voting — HSET overwrites, one vote per player
      2. Count votes per target — iterate values and tally
      3. Check if all players voted — HLEN vs LLEN of players list
    A hash does all three cleanly with no extra bookkeeping.
    """
    await r.hset(f"room:{room_code}:votes", voter_id, target_id)


async def get_votes(room_code: str) -> dict:
    return await r.hgetall(f"room:{room_code}:votes")


async def clear_votes(room_code: str):
    await r.delete(f"room:{room_code}:votes")


async def all_votes_in(room_code: str) -> bool:
    """
    WHY COMPARE HLEN TO LLEN INSTEAD OF TRACKING A SEPARATE VOTE COUNT:
    No extra state needed. The number of entries in the votes hash IS
    the vote count. The number of entries in the players list IS the
    player count. Two Redis calls, zero counters to keep in sync.

    ACKNOWLEDGED RACE CONDITION:
    Two votes arriving simultaneously could both read total_votes < total_players
    before either write completes, causing tally_votes to never fire.
    With max 4 players this window is microseconds wide and the worst
    consequence is players need to notice and re-vote. Production fix
    would be a Lua script or Redis transaction. Acceptable here.
    """
    total_players = await r.llen(f"room:{room_code}:players")
    total_votes = await r.hlen(f"room:{room_code}:votes")
    return total_votes >= total_players
