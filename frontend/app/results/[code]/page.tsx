"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { initStringTune } from "@/lib/stringtune"
import { getSocket } from "@/lib/socket"
import SpyReveal from "@/components/results/SpyReveal"
import DirectiveExpose from "@/components/results/DirectiveExpose"
import { VoteResult, GameOverPayload, MOCK_VOTE_RESULT } from "@/types/game"

type Phase = 0 | 1 | 2 | 3 | 4 | 5

export default function ResultsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()

  const [revealPhase, setRevealPhase] = useState<Phase>(0)
  const [result, setResult] = useState<VoteResult | null>(null)
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null)
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({})

  useEffect(() => {
    initStringTune()

    // Load stored result data
    const vr = sessionStorage.getItem("vote_result")
    const go = sessionStorage.getItem("game_over")
    const gs = sessionStorage.getItem("game_start")

    if (vr) setResult(JSON.parse(vr))
    else if (go) setGameOver(JSON.parse(go))
    else setResult(MOCK_VOTE_RESULT)

    if (gs) {
      const parsed = JSON.parse(gs)
      if (parsed.player_names) setPlayerNames(parsed.player_names)
    }

    // Stay connected so we receive game_restart from other players
    const socket = getSocket()
    if (!socket.connected) socket.connect()
    socket.on("game_restart", () => {
      sessionStorage.removeItem("vote_result")
      sessionStorage.removeItem("game_over")
      sessionStorage.removeItem("game_start")
      router.push(`/room/${code}`)
    })

    // Cinematic reveal sequence
    const timings: [Phase, number][] = [
      [1, 500],    // Phase 1: "EXPERIMENT COMPLETE"
      [2, 2500],   // Phase 2: result announcement
      [3, 4500],   // Phase 3: flip card
      [4, 7000],   // Phase 4: directive
      [5, 10000],  // Phase 5: action buttons
    ]
    const timeouts = timings.map(([phase, delay]) =>
      setTimeout(() => setRevealPhase(phase), delay)
    )
    return () => {
      timeouts.forEach(clearTimeout)
      socket.off("game_restart")
    }
  }, [code, router])

  const impostorId = result?.eliminated_id ?? gameOver?.impostor_id ?? ""
  const impostorName = playerNames[impostorId] ?? impostorId ?? "Unknown"
  const directive = result?.impostor_directive ?? gameOver?.impostor_directive ?? ""
  const wasImpostorCaught = result?.was_impostor ?? (gameOver?.winner === "players")
  const playersWon = wasImpostorCaught

  async function startNewGame() {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/room/restart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_code: code }),
    }).catch(() => {})
    // game_restart socket event will navigate everyone including this tab
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "var(--lab-void)" }}
      string-parallax="0.2"
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: playersWon
            ? "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(0,223,162,0.06) 0%, transparent 70%)"
            : "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(255,51,85,0.06) 0%, transparent 70%)",
        }}
      />
      <div className="absolute inset-0 pointer-events-none lab-grid-bg opacity-40" />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center max-w-2xl w-full">
        {/* Phase 1: EXPERIMENT COMPLETE */}
        {revealPhase >= 1 && (
          <p
            className="font-[family-name:var(--font-space-mono)] text-sm tracking-[0.4em] uppercase animate-fade-in"
            style={{ color: "var(--lab-text-dim)" }}
          >
            — EXPERIMENT COMPLETE —
          </p>
        )}

        {/* Phase 2: Result headline */}
        {revealPhase >= 2 && (
          <div className="flex flex-col items-center gap-3 animate-slide-up">
            <h1
              className="font-[family-name:var(--font-space-mono)] text-3xl md:text-4xl font-bold uppercase tracking-widest"
              style={{
                color: playersWon ? "var(--lab-accent)" : "var(--lab-danger)",
                textShadow: playersWon
                  ? "0 0 40px var(--lab-accent-dim)"
                  : "0 0 40px var(--lab-danger-dim)",
              }}
            >
              {playersWon ? "PAPER PUBLISHED SUCCESSFULLY" : "RIVAL LAB PUBLISHES FIRST"}
            </h1>
            <p className="text-[var(--lab-text-dim)] text-sm">
              {playersWon
                ? "The impostor was caught. Science prevails."
                : "The impostor escaped detection. The paper is compromised."}
            </p>
          </div>
        )}

        {/* Phase 3: Flip card reveal */}
        {revealPhase >= 3 && (
          <div className="animate-slide-up flex flex-col items-center gap-3">
            <p className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)]">
              IMPOSTOR IDENTITY
            </p>
            <SpyReveal impostorName={impostorName} wasImpostor={wasImpostorCaught} />
          </div>
        )}

        {/* Phase 4: Directive expose */}
        {revealPhase >= 4 && directive && (
          <DirectiveExpose directive={directive} />
        )}

        {/* Vote summary */}
        {revealPhase >= 4 && result?.votes && (
          <div
            className="animate-fade-in flex flex-col gap-2 w-full max-w-xs"
            style={{ animationDelay: "0.3s" }}
          >
            <p className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)]">
              VOTE TALLY
            </p>
            {Object.entries(result.votes).map(([pid, count]) => (
              <div key={pid} className="flex justify-between items-center text-xs font-[family-name:var(--font-space-mono)]">
                <span style={{ color: pid === result.eliminated_id ? "var(--lab-danger)" : "var(--lab-text-dim)" }}>
                  {playerNames[pid] ?? pid}
                  {pid === result.eliminated_id ? " ◀ ELIMINATED" : ""}
                </span>
                <span style={{ color: "var(--lab-warn)" }}>{count} VOTE{count !== 1 ? "S" : ""}</span>
              </div>
            ))}
          </div>
        )}

        {/* Phase 5: Action buttons */}
        {revealPhase >= 5 && (
          <div className="animate-slide-up flex flex-col sm:flex-row gap-4 w-full max-w-sm">
            <button
              string="magnetic"
              string-radius="200"
              string-strength="0.3"
              onClick={startNewGame}
              className="flex-1 py-3 rounded font-bold tracking-widest uppercase text-sm transition-all cursor-pointer font-[family-name:var(--font-space-mono)]"
              style={{ background: "var(--lab-accent)", color: "var(--lab-void)", border: "none" }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 0 24px var(--lab-accent-dim)" }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none" }}
            >
              NEW EXPERIMENT
            </button>
            <button
              onClick={() => router.push("/")}
              className="flex-1 py-3 rounded font-bold tracking-widest uppercase text-sm transition-all cursor-pointer font-[family-name:var(--font-space-mono)]"
              style={{ background: "transparent", color: "var(--lab-text)", border: "1px solid var(--lab-border-hi)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--lab-accent)"; e.currentTarget.style.color = "var(--lab-accent)" }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--lab-border-hi)"; e.currentTarget.style.color = "var(--lab-text)" }}
            >
              RETURN TO LOBBY
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 px-6 py-3 text-[10px] tracking-widest text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)] uppercase text-center" style={{ borderTop: "1px solid var(--lab-border)" }}>
        POWERED BY K2 THINK V2 · GEMINI 2.5 PRO · MONGODB ATLAS · YHACK 2026
      </footer>
    </div>
  )
}
