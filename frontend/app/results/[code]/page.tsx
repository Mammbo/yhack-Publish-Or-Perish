"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { initStringTune } from "@/lib/stringtune"
import { getSocket } from "@/lib/socket"
import SpyReveal from "@/components/results/SpyReveal"
import DirectiveExpose from "@/components/results/DirectiveExpose"
import BorderGlow from "@/components/ui/BorderGlow"
import FluidBackground from "@/components/shared/FluidBackground"
import { VoteResult, GameOverPayload, ExperimentResult, MOCK_VOTE_RESULT } from "@/types/game"

type Phase = 0 | 1 | 2 | 3 | 4 | 5

export default function ResultsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()

  const [revealPhase, setRevealPhase] = useState<Phase>(0)
  const [result, setResult] = useState<VoteResult | null>(null)
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null)
  const [experimentResult, setExperimentResult] = useState<ExperimentResult | null>(null)
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({})

  // Load data and socket — depends on code/router
  useEffect(() => {
    initStringTune()

    const vr = sessionStorage.getItem("vote_result")
    const go = sessionStorage.getItem("game_over")
    const er = sessionStorage.getItem("experiment_result")
    const gs = sessionStorage.getItem("game_start")

    if (er) {
      const parsed: ExperimentResult = JSON.parse(er)
      setExperimentResult(parsed)
      if (parsed.player_names) setPlayerNames(parsed.player_names)
    } else if (vr) setResult(JSON.parse(vr))
    else if (go) setGameOver(JSON.parse(go))
    else setResult(MOCK_VOTE_RESULT)

    if (gs) {
      const parsed = JSON.parse(gs)
      if (parsed.player_names) setPlayerNames(parsed.player_names)
    }

    const socket = getSocket()
    if (!socket.connected) socket.connect()
    socket.on("game_restart", () => {
      sessionStorage.removeItem("vote_result")
      sessionStorage.removeItem("game_over")
      sessionStorage.removeItem("game_start")
      router.push(`/room/${code}`)
    })

    return () => { socket.off("game_restart") }
  }, [code, router])

  // Cinematic reveal — run once on mount
  useEffect(() => {
    const timings: [Phase, number][] = [
      [1, 500],
      [2, 2500],
      [3, 4500],
      [4, 7000],
      [5, 10000],
    ]
    const timeouts = timings.map(([phase, delay]) =>
      setTimeout(() => setRevealPhase(phase), delay)
    )
    return () => timeouts.forEach(clearTimeout)
  }, [])

  const impostorId = experimentResult?.impostor_id ?? result?.eliminated_id ?? gameOver?.impostor_id ?? ""
  const impostorName = playerNames[impostorId] ?? impostorId ?? "Unknown"
  const directive = experimentResult?.impostor_directive ?? result?.impostor_directive ?? gameOver?.impostor_directive ?? ""
  const wasImpostorCaught = result?.was_impostor ?? (gameOver?.winner === "players")
  const playersWon = experimentResult ? experimentResult.verdict === "PASS" : wasImpostorCaught

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
    >
      <FluidBackground speed="normal" />

      {/* Background glow */}
      <div
        data-string-parallax="0.2"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: playersWon
            ? "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(0,223,162,0.06) 0%, transparent 70%)"
            : "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(255,51,85,0.06) 0%, transparent 70%)",
        }}
      />
      <div className="absolute inset-0 pointer-events-none lab-grid-bg opacity-40" />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center max-w-2xl w-full">
        {revealPhase >= 1 && (
          <p
            data-string="split"
            data-string-id="experiment-complete"
            data-string-split="char[start]"
            data-string-repeat
            className="font-[family-name:var(--font-mono)] text-sm tracking-[0.4em] uppercase animate-fade-in"
            style={{ color: "var(--lab-text-dim)" }}
          >
            — EXPERIMENT COMPLETE —
          </p>
        )}

        {revealPhase >= 2 && (
          <div className="flex flex-col items-center gap-3 animate-slide-up">
            <h1
              data-string="split"
              data-string-id="result-headline"
              data-string-split="word[start]"
              data-string-repeat
              className="font-[family-name:var(--font-mono)] text-3xl md:text-4xl font-bold uppercase tracking-widest"
              style={{
                color: playersWon ? "var(--lab-accent)" : "var(--lab-danger)",
                textShadow: playersWon
                  ? "0 0 40px var(--lab-accent-dim)"
                  : "0 0 40px var(--lab-danger-dim)",
              }}
            >
              {experimentResult
                ? (playersWon ? "PAPER APPROVED FOR PUBLICATION" : "PAPER REJECTED — FLAWED METHODOLOGY")
                : (playersWon ? "PAPER PUBLISHED SUCCESSFULLY" : "RIVAL LAB PUBLISHES FIRST")}
            </h1>
            <p className="text-[var(--lab-text-dim)] text-sm">
              {experimentResult
                ? (playersWon ? "The collaborative document passed peer review." : "The impostor's sabotage compromised the work.")
                : (playersWon ? "The impostor was caught. Science prevails." : "The impostor escaped detection. The paper is compromised.")}
            </p>
          </div>
        )}

        {revealPhase >= 3 && (
          <div className="animate-slide-up flex flex-col items-center gap-3">
            <p className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)]">
              IMPOSTOR IDENTITY
            </p>
            <BorderGlow
              backgroundColor="#111822"
              borderRadius={8}
              glowRadius={40}
              glowIntensity={0.9}
              colors={playersWon ? ["#FF3355", "#FF5577"] : ["#FFB020", "#FF3355"]}
              fillOpacity={0.3}
              data-string="spotlight"
              data-string-id="dossier-card"
              data-string-lerp="0.2"
            >
              <div className="p-4">
                <SpyReveal impostorName={impostorName} wasImpostor={wasImpostorCaught} />
              </div>
            </BorderGlow>
          </div>
        )}

        {revealPhase >= 4 && directive && (
          <DirectiveExpose directive={directive} />
        )}

        {revealPhase >= 4 && experimentResult?.assessment && (
          <div
            className="animate-fade-in w-full max-w-md p-4 rounded border text-center"
            style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)", animationDelay: "0.5s" }}
          >
            <p className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] mb-2">
              GEMINI EVALUATION
            </p>
            <p className="text-sm text-[var(--lab-text)] leading-relaxed">
              {experimentResult.assessment}
            </p>
          </div>
        )}

        {revealPhase >= 4 && result?.votes && (
          <div
            className="animate-fade-in flex flex-col gap-2 w-full max-w-xs"
            style={{ animationDelay: "0.3s" }}
          >
            <p className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)]">
              VOTE TALLY
            </p>
            {Object.entries(result.votes).map(([pid, count]) => (
              <div key={pid} className="flex justify-between items-center text-xs font-[family-name:var(--font-mono)]">
                <span style={{ color: pid === result.eliminated_id ? "var(--lab-danger)" : "var(--lab-text-dim)" }}>
                  {playerNames[pid] ?? pid}
                  {pid === result.eliminated_id ? " ◀ ELIMINATED" : ""}
                </span>
                <span style={{ color: "var(--lab-warn)" }}>{count} VOTE{count !== 1 ? "S" : ""}</span>
              </div>
            ))}
          </div>
        )}

        {revealPhase >= 5 && (
          <div className="animate-slide-up flex flex-col sm:flex-row gap-4 w-full max-w-sm">
            <BorderGlow
              backgroundColor="transparent"
              borderRadius={6}
              glowRadius={20}
              glowIntensity={1.0}
              colors={["#00DFA2", "#00E89C", "#00B87A"]}
              fillOpacity={0.2}
              className="flex-1"
            >
              <button
                data-string="magnetic"
                data-string-radius="200"
                data-string-strength="0.3"
                onClick={startNewGame}
                className="w-full py-3 rounded font-bold tracking-widest uppercase text-sm transition-all cursor-pointer font-[family-name:var(--font-mono)]"
                style={{ background: "var(--lab-accent)", color: "var(--lab-void)", border: "none" }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 0 24px var(--lab-accent-dim)" }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none" }}
              >
                NEW EXPERIMENT
              </button>
            </BorderGlow>
            <button
              data-string="magnetic"
              data-string-radius="200"
              data-string-strength="0.3"
              onClick={() => router.push("/")}
              className="flex-1 py-3 rounded font-bold tracking-widest uppercase text-sm transition-all cursor-pointer font-[family-name:var(--font-mono)]"
              style={{ background: "transparent", color: "var(--lab-text)", border: "1px solid var(--lab-border-hi)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--lab-accent)"; e.currentTarget.style.color = "var(--lab-accent)" }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--lab-border-hi)"; e.currentTarget.style.color = "var(--lab-text)" }}
            >
              RETURN TO LOBBY
            </button>
          </div>
        )}
      </div>

      <footer className="absolute bottom-0 left-0 right-0 px-6 py-3 text-[10px] tracking-widest text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] uppercase text-center" style={{ borderTop: "1px solid var(--lab-border)" }}>
        POWERED BY K2 THINK V2 · GEMINI 2.5 PRO · MONGODB ATLAS · YHACK 2026
      </footer>
    </div>
  )
}
