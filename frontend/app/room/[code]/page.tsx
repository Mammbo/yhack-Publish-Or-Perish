"use client"

import { useEffect, useState, useRef, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getSocket } from "@/lib/socket"
import { initStringTune } from "@/lib/stringtune"
import PlayerCard from "@/components/lobby/PlayerCard"
import FileUpload from "@/components/lobby/FileUpload"
import IngestionLoader from "@/components/lobby/IngestionLoader"
import CornerMarkers from "@/components/shared/CornerMarkers"

interface PlayerInfo {
  id: string
  name: string
}

export default function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get("demo") === "true"

  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [phase, setPhase] = useState<"waiting" | "ingesting" | "ready">("waiting")
  const [copied, setCopied] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState("")
  const [myPlayerName, setMyPlayerName] = useState("")
  const [isConnected, setIsConnected] = useState(false)

  // Host is the first player who joined
  const hostId = players[0]?.id ?? ""

  useEffect(() => {
    initStringTune()

    const pid = localStorage.getItem("player_id") ?? crypto.randomUUID()
    const pname = localStorage.getItem("player_name") ?? "Researcher"
    localStorage.setItem("player_id", pid)
    localStorage.setItem("player_name", pname)
    setMyPlayerId(pid)
    setMyPlayerName(pname)

    if (isDemo) {
      // Demo mode — simulate socket events
      setPlayers([
        { id: pid, name: pname },
        { id: "player_2", name: "Dr. Chen" },
        { id: "player_3", name: "Prof. Reyes" },
      ])
      setIsConnected(true)
      return
    }

    const socket = getSocket()
    socket.connect()

    socket.on("connect", () => {
      setIsConnected(true)
      socket.emit("join_room", { room_code: code, player_id: pid, player_name: pname })
    })
    socket.on("disconnect", () => setIsConnected(false))

    socket.on("player_joined", (data: { players: string[]; player_names?: Record<string, string> }) => {
      const names = data.player_names ?? {}
      setPlayers(data.players.map((id) => ({ id, name: names[id] ?? id })))
    })

    socket.on("upload_complete", () => setPhase("ingesting"))

    socket.on("game_start", (data: { problem_statement: string; players: string[]; first_turn: string; player_names?: Record<string, string> }) => {
      sessionStorage.setItem("game_start", JSON.stringify(data))
      router.push(`/game/${code}`)
    })

    return () => {
      socket.off("connect")
      socket.off("disconnect")
      socket.off("player_joined")
      socket.off("upload_complete")
      socket.off("game_start")
    }
  }, [code, router, isDemo])

  function copyCode() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function startDemo() {
    const demoData = {
      problem_statement: "Implement a binary search function that returns the index of the target element, or -1 if not found. Each researcher contributes one section: function signature, base case, recursive logic, and edge case handling.",
      players: [myPlayerId, "player_2", "player_3", "player_4"],
      first_turn: myPlayerId,
      player_names: {
        [myPlayerId]: myPlayerName,
        "player_2": "Dr. Chen",
        "player_3": "Prof. Reyes",
        "player_4": "Dr. Okafor",
      }
    }
    sessionStorage.setItem("game_start", JSON.stringify(demoData))
    router.push(`/game/${code}?demo=true`)
  }

  async function beginExperiment() {
    if (isDemo) { startDemo(); return }
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/room/mock-start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_code: code }),
      })
    } catch {
      startDemo()
    }
  }

  const isHost = myPlayerId === hostId || players.length === 0
  const uploadDone = phase === "ingesting"
  const canStart = (players.length >= 4 && uploadDone) || isDemo

  return (
    <div className="min-h-screen flex flex-col lab-grid-bg">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b lab-scanlines" style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)" }}>
        <span className="font-[family-name:var(--font-space-mono)] text-[var(--lab-accent)] text-sm font-bold tracking-widest">
          PUBLISH<span className="text-[var(--lab-text-dim)]"> OR </span>PERISH
        </span>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "animate-pulse-dot" : ""}`} style={{ background: isConnected ? "var(--lab-accent)" : "var(--lab-text-dim)" }} />
          <span className="text-xs font-[family-name:var(--font-space-mono)] text-[var(--lab-text-dim)]">
            {isConnected ? "CONNECTED" : "CONNECTING..."}
          </span>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 max-w-6xl mx-auto w-full">
        {/* Left — Players */}
        <div className="flex flex-col gap-6">
          {/* Room code */}
          <CornerMarkers className="p-5 rounded border" style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)" } as React.CSSProperties}>
            <div className="flex flex-col gap-2">
              <p className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)]">
                LAB ACCESS CODE
              </p>
              <button
                onClick={copyCode}
                className="flex items-center gap-3 group cursor-pointer"
              >
                <span
                  className="data-readout text-3xl font-bold tracking-[0.5em]"
                  style={{ color: "var(--lab-accent)", textShadow: "0 0 20px var(--lab-accent-dim)" }}
                >
                  {code.split("").join(" ")}
                </span>
                <span className="text-xs font-[family-name:var(--font-space-mono)] transition-colors" style={{ color: copied ? "var(--lab-accent)" : "var(--lab-text-dim)" }}>
                  {copied ? "✓ COPIED" : "COPY"}
                </span>
              </button>
              <p className="text-xs text-[var(--lab-text-dim)]">Share this code with your team</p>
            </div>
          </CornerMarkers>

          {/* Player grid */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)]">
                RESEARCH TEAM
              </p>
              <span className="data-readout text-xs" style={{ color: "var(--lab-accent)" }}>
                {players.length}/4
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {players.map((p, i) => (
                <PlayerCard
                  key={p.id}
                  playerId={p.id}
                  name={p.name}
                  isHost={p.id === hostId || i === 0}
                  isMe={p.id === myPlayerId}
                  isConnected={true}
                />
              ))}
              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="p-4 rounded border border-dashed flex items-center gap-3"
                  style={{ borderColor: "var(--lab-border)", background: "transparent" }}
                >
                  <div className="w-10 h-10 rounded-full border border-dashed flex items-center justify-center" style={{ borderColor: "var(--lab-border)" }}>
                    <span style={{ color: "var(--lab-text-dim)" }} className="text-sm">?</span>
                  </div>
                  <span className="text-xs text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)]">
                    AWAITING RESEARCHER...
                  </span>
                </div>
              ))}
            </div>

            {/* RESEARCHERS CONNECTED counter */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px" style={{ background: "var(--lab-border)" }} />
              <span className="text-[10px] font-[family-name:var(--font-space-mono)] text-[var(--lab-text-dim)] tracking-wider px-2">
                {players.length} RESEARCHER{players.length !== 1 ? "S" : ""} CONNECTED
              </span>
              <div className="flex-1 h-px" style={{ background: "var(--lab-border)" }} />
            </div>
          </div>

          {/* Begin button (host only) */}
          {isHost && (
            <button
              string="magnetic"
              string-radius="300"
              string-strength="0.4"
              onClick={beginExperiment}
              disabled={!canStart}
              className="w-full py-3 rounded font-bold tracking-widest uppercase text-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-space-mono)]"
              style={{
                background: canStart ? "var(--lab-accent)" : "var(--lab-surface-hi)",
                color: canStart ? "var(--lab-void)" : "var(--lab-text-dim)",
                border: "none",
              }}
              onMouseEnter={(e) => { if (canStart) e.currentTarget.style.boxShadow = "0 0 24px var(--lab-accent-dim)" }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none" }}
            >
              {canStart
                ? "BEGIN EXPERIMENT →"
                : players.length < 4
                  ? `NEED ${4 - players.length} MORE RESEARCHER${4 - players.length !== 1 ? "S" : ""}`
                  : "UPLOAD MATERIALS FIRST"
              }
            </button>
          )}
        </div>

        {/* Right — Upload / Ingestion */}
        <div className="flex flex-col gap-4">
          <p className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)]">
            RESEARCH MATERIALS
          </p>

          {phase === "ingesting" ? (
            <IngestionLoader />
          ) : (
            <FileUpload roomCode={code} onUploadComplete={() => setPhase("ingesting")} />
          )}

          <div className="p-4 rounded border" style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)" }}>
            <p className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)] mb-2">
              AI PIPELINE
            </p>
            <p className="text-xs text-[var(--lab-text-dim)]">
              Upload your study materials. Our AI will read them, search for context, and generate a collaborative research problem — plus secretly assign one of you as the impostor.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-3 border-t text-[10px] tracking-widest text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)] uppercase" style={{ borderColor: "var(--lab-border)" }}>
        POWERED BY K2 THINK V2 · GEMINI 2.5 PRO · MONGODB ATLAS · YHACK 2026
      </footer>
    </div>
  )
}
