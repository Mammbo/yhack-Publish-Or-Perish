# Person 3 — Frontend & Game UI

**Own:** Next.js app, all pages, Socket.io client, game UI

**Your job:** Build every screen the player sees — lobby, game, voting, results. You consume Person 1's socket events and render them. You hand off the upload component to Person 4 to wire to their endpoint.

---

## How Your Piece Fits

```
Person 1 (backend) → emits socket events
You                → listens to events, updates React state, renders UI
Person 4 (upload)  → provides upload endpoint, you build the UI component they wire up
```

After Hour 6 you should have a working game view running against Person 1's `/room/mock-start` endpoint — not waiting for real AI.

---

## Stack

| Tech | Role | Docs |
|---|---|---|
| Next.js 14 | React framework with App Router + SSR | https://nextjs.org/docs |
| TypeScript | Type safety for socket payloads and state | https://www.typescriptlang.org/docs/ |
| Tailwind CSS | Utility-first styling | https://tailwindcss.com/docs |
| Shadcn/ui | Pre-built Tailwind component library | https://ui.shadcn.com/docs |
| socket.io-client | Socket.io browser client | https://socket.io/docs/v4/client-api/ |

---

## Hours 0–4: App Scaffold + Lobby

### 1. Init Project

```bash
npx create-next-app@latest publish-or-perish --typescript --tailwind --app
cd publish-or-perish
npx shadcn@latest init
npm install socket.io-client
```

**Next.js App Router docs:** https://nextjs.org/docs/app
**Shadcn/ui getting started:** https://ui.shadcn.com/docs/installation/next

### 2. Pages

| Route | What it is |
|---|---|
| `/` | Landing — create room or join with code |
| `/room/[code]` | Lobby — shows connected players, upload zone, waiting for game start |
| `/game/[code]` | Main game view — problem, contributions feed, input area, turn indicator |
| `/results/[code]` | End screen — winner, impostor reveal, directive shown |

```
app/
  page.tsx                  ← landing
  room/
    [code]/
      page.tsx              ← lobby
  game/
    [code]/
      page.tsx              ← game
  results/
    [code]/
      page.tsx              ← results
```

### 3. Socket.io Client Setup

Create a shared socket instance. Don't create it per-component — one instance for the whole app.

**socket.io-client docs:** https://socket.io/docs/v4/client-api/

```typescript
// lib/socket.ts
import { io, Socket } from "socket.io-client"

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      autoConnect: false,
    })
  }
  return socket
}
```

```typescript
// In a component
"use client"
import { useEffect, useState } from "react"
import { getSocket } from "@/lib/socket"

export default function LobbyPage({ params }: { params: { code: string } }) {
  const [players, setPlayers] = useState<string[]>([])
  const socket = getSocket()

  useEffect(() => {
    socket.connect()
    socket.emit("join_room", {
      room_code: params.code,
      player_id: localStorage.getItem("player_id"),
      player_name: localStorage.getItem("player_name"),
    })

    socket.on("player_joined", (data) => setPlayers(data.players))

    return () => {
      socket.off("player_joined")
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Room {params.code}</h1>
      <p className="text-muted-foreground">{players.length}/4 players</p>
      {players.map((id) => (
        <div key={id} className="rounded border px-4 py-2 w-full">{id}</div>
      ))}
    </div>
  )
}
```

**Next.js "use client" docs:** https://nextjs.org/docs/app/building-your-application/rendering/client-components

---

## Hours 4–10: Game UI

### Game State Types

Define these types first — they match Person 1's socket payloads exactly.

```typescript
// types/game.ts
export type GamePhase = "waiting" | "ingesting" | "playing" | "voting" | "ended"

export interface Contribution {
  player_id: string
  content: string
}

export interface GameState {
  phase: GamePhase
  problem_statement: string
  players: string[]
  current_turn: string
  contributions: Record<string, string>
  is_impostor: boolean
  impostor_directive: string | null
}
```

### Game Page Layout

```
┌─────────────────────────────────────────────────┐
│  PROBLEM STATEMENT                               │
│  [full width, always visible]                    │
├──────────────────────┬──────────────────────────┤
│  CONTRIBUTIONS FEED  │  YOUR TURN               │
│  [scrollable]        │  [input + submit]        │
│                      │  [locked if not your turn]│
│  Player 1: ...       │                          │
│  Player 2: ...       │  [Call Meeting button]   │
│  Player 3: ...       │                          │
└──────────────────────┴──────────────────────────┘
│  PLAYERS: ● P1  ● P2  ● P3  ⟳ P4 (active turn) │
└─────────────────────────────────────────────────┘
```

```typescript
// app/game/[code]/page.tsx
"use client"
import { useEffect, useState, useRef } from "react"
import { getSocket } from "@/lib/socket"
import { GameState } from "@/types/game"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export default function GamePage({ params }: { params: { code: string } }) {
  const [game, setGame] = useState<GameState>({
    phase: "waiting",
    problem_statement: "",
    players: [],
    current_turn: "",
    contributions: {},
    is_impostor: false,
    impostor_directive: null,
  })
  const [input, setInput] = useState("")
  const socket = getSocket()
  const myPlayerId = typeof window !== "undefined" ? localStorage.getItem("player_id") ?? "" : ""
  const isMyTurn = game.current_turn === myPlayerId

  useEffect(() => {
    socket.on("game_start", (data) => {
      setGame((g) => ({
        ...g,
        phase: "playing",
        problem_statement: data.problem_statement,
        players: data.players,
        current_turn: data.first_turn,
      }))
    })

    socket.on("impostor_directive", (data) => {
      setGame((g) => ({ ...g, is_impostor: true, impostor_directive: data.directive }))
    })

    socket.on("contribution_update", (data) => {
      setGame((g) => ({ ...g, contributions: data.contributions_so_far }))
    })

    socket.on("turn_update", (data) => {
      setGame((g) => ({ ...g, current_turn: data.current_player_id }))
    })

    socket.on("meeting_called", () => {
      setGame((g) => ({ ...g, phase: "voting" }))
    })

    return () => {
      socket.off("game_start")
      socket.off("impostor_directive")
      socket.off("contribution_update")
      socket.off("turn_update")
      socket.off("meeting_called")
    }
  }, [])

  function submitContribution() {
    if (!input.trim()) return
    socket.emit("submit_contribution", {
      room_code: params.code,
      player_id: myPlayerId,
      content: input,
    })
    setInput("")
  }

  function callMeeting() {
    socket.emit("call_meeting", { room_code: params.code, caller_id: myPlayerId })
  }

  return (
    <div className="min-h-screen p-6 flex flex-col gap-6">
      {/* Impostor banner — only shown to the impostor */}
      {game.is_impostor && game.impostor_directive && (
        <div className="bg-red-950 border border-red-700 text-red-300 rounded-lg p-4">
          <p className="font-semibold text-sm uppercase tracking-wide">You are the impostor</p>
          <p className="mt-1">{game.impostor_directive}</p>
        </div>
      )}

      {/* Problem */}
      <div className="rounded-lg border p-6 bg-muted/30">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Problem</p>
        <p className="text-lg">{game.problem_statement}</p>
      </div>

      <div className="grid grid-cols-2 gap-6 flex-1">
        {/* Contributions feed */}
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground font-medium">Contributions</p>
          {Object.entries(game.contributions).map(([pid, text]) => (
            <div key={pid} className="rounded border p-3">
              <p className="text-xs text-muted-foreground mb-1">{pid}</p>
              <p>{text}</p>
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground font-medium">
            {isMyTurn ? "Your turn" : `Waiting for ${game.current_turn}...`}
          </p>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!isMyTurn}
            placeholder={isMyTurn ? "Write your contribution..." : ""}
            className="flex-1 min-h-[200px] resize-none"
          />
          <Button onClick={submitContribution} disabled={!isMyTurn || !input.trim()}>
            Submit
          </Button>
          <Button variant="destructive" onClick={callMeeting}>
            Call Emergency Meeting
          </Button>
        </div>
      </div>

      {/* Player status bar */}
      <div className="flex gap-4 border-t pt-4">
        {game.players.map((pid) => (
          <div
            key={pid}
            className={`flex items-center gap-2 text-sm ${pid === game.current_turn ? "text-primary font-semibold" : "text-muted-foreground"}`}
          >
            <span className={`w-2 h-2 rounded-full ${pid === game.current_turn ? "bg-primary animate-pulse" : "bg-muted"}`} />
            {pid}
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Hours 10–16: Voting & Meeting UI

Show this as a full-screen modal overlay when `meeting_called` fires.

**Tailwind animate classes:** https://tailwindcss.com/docs/animation

```typescript
// components/VotingModal.tsx
"use client"
import { useState } from "react"
import { getSocket } from "@/lib/socket"
import { Button } from "@/components/ui/button"

interface VotingModalProps {
  players: string[]
  roomCode: string
  myPlayerId: string
  onVoteResult: (result: VoteResult) => void
}

export interface VoteResult {
  eliminated_id: string
  was_impostor: boolean
  impostor_directive: string
  votes: Record<string, number>
}

export default function VotingModal({ players, roomCode, myPlayerId, onVoteResult }: VotingModalProps) {
  const [voted, setVoted] = useState(false)
  const socket = getSocket()

  function castVote(targetId: string) {
    socket.emit("cast_vote", {
      room_code: roomCode,
      voter_id: myPlayerId,
      target_id: targetId,
    })
    setVoted(true)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in">
      <div className="bg-background rounded-xl p-8 w-full max-w-md flex flex-col gap-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-red-500 mb-2">Emergency Meeting</p>
          <h2 className="text-2xl font-bold">Vote out the impostor</h2>
        </div>
        {voted ? (
          <p className="text-center text-muted-foreground">Vote cast. Waiting for others...</p>
        ) : (
          <div className="flex flex-col gap-3">
            {players
              .filter((p) => p !== myPlayerId)
              .map((pid) => (
                <Button key={pid} variant="outline" className="w-full" onClick={() => castVote(pid)}>
                  Vote out {pid}
                </Button>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

### Reveal Screen (vote_result)

Pure CSS flip card to reveal the impostor.

```typescript
// After vote_result socket event fires, navigate to /results/[code]
socket.on("vote_result", (data: VoteResult) => {
  // Pass data via query params or sessionStorage
  sessionStorage.setItem("vote_result", JSON.stringify(data))
  router.push(`/results/${params.code}`)
})
```

```typescript
// app/results/[code]/page.tsx
"use client"
import { useEffect, useState } from "react"

export default function ResultsPage() {
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem("vote_result")
    if (stored) setResult(JSON.parse(stored))
  }, [])

  if (!result) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold">
        {result.was_impostor ? "Impostor Caught!" : "Impostor Escapes!"}
      </h1>
      {/* Flip card reveal */}
      <div className="w-64 h-48 [perspective:1000px] cursor-pointer group">
        <div className="relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
          <div className="absolute inset-0 rounded-xl bg-red-900 flex items-center justify-center [backface-visibility:hidden]">
            <p className="text-white font-bold text-lg">Who was it?</p>
          </div>
          <div className="absolute inset-0 rounded-xl bg-muted flex flex-col items-center justify-center gap-2 [transform:rotateY(180deg)] [backface-visibility:hidden] p-4">
            <p className="font-bold">{result.eliminated_id}</p>
            <p className="text-xs text-muted-foreground text-center">{result.impostor_directive}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## Hours 16–24: Polish + Integration

### Loading States

Show this between upload and `game_start`:

```typescript
socket.on("upload_complete", () => setPhase("ingesting"))
socket.on("game_start", () => setPhase("playing"))

// In render:
{phase === "ingesting" && (
  <div className="flex flex-col items-center gap-4">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    <p className="text-muted-foreground">AI is reading your notes...</p>
  </div>
)}
```

### Disconnect Handling

```typescript
socket.on("connect_error", () => setConnectionError(true))
socket.on("disconnect", () => setConnectionError(true))
```

### Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000  # or https://api.publishorperish.com in prod
```

---

## Project Setup

```bash
npx create-next-app@latest publish-or-perish --typescript --tailwind --app
cd publish-or-perish
npx shadcn@latest init
npm install socket.io-client
npm run dev
```

**Next.js environment variables:** https://nextjs.org/docs/app/building-your-application/configuring/environment-variables
**Tailwind CSS docs:** https://tailwindcss.com/docs/installation
**Shadcn/ui component list:** https://ui.shadcn.com/docs/components/button
