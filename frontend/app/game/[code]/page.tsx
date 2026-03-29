"use client"

import { useEffect, useState, useRef, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getSocket } from "@/lib/socket"
import { initStringTune } from "@/lib/stringtune"
import { VoteResult, ExperimentResult, MOCK_CONTRIBUTIONS } from "@/types/game"
import LabHeader from "@/components/shared/LabHeader"
import ImpostorBanner from "@/components/game/ImpostorBanner"
import ProblemDisplay from "@/components/game/ProblemDisplay"
import ContributionFeed from "@/components/game/ContributionFeed"
import PlayerStatusBar from "@/components/game/PlayerStatusBar"
import MeetingModal from "@/components/meeting/MeetingModal"
import FluidBackground from "@/components/shared/FluidBackground"

interface GameData {
  problem_statement: string
  players: string[]
  player_names?: Record<string, string>
}

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get("demo") === "true"

  const [myPlayerId, setMyPlayerId] = useState("")
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({})
  const [players, setPlayers] = useState<string[]>([])
  const [problem, setProblem] = useState("")
  const [contributions, setContributions] = useState<Record<string, string>>({})
  const [latestContributor, setLatestContributor] = useState<string | undefined>()
  const [isImpostor, setIsImpostor] = useState(false)
  const [directive, setDirective] = useState<string | null>(null)
  const [phase, setPhase] = useState<"playing" | "voting">("playing")
  const [eliminatedPlayers, setEliminatedPlayers] = useState<string[]>([])
  const [callerName, setCallerName] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [finishVoteCount, setFinishVoteCount] = useState(0)
  const [hasVotedFinish, setHasVotedFinish] = useState(false)

  // Ref so socket handlers always see latest playerNames without being in deps
  const playerNamesRef = useRef<Record<string, string>>({})
  playerNamesRef.current = playerNames

  const myPlayerIdRef = useRef("")

  useEffect(() => {
    const pid = sessionStorage.getItem("player_id") ?? ""
    setMyPlayerId(pid)
    myPlayerIdRef.current = pid

    const stored = sessionStorage.getItem("game_start")
    if (stored) {
      const data: GameData = JSON.parse(stored)
      setProblem(data.problem_statement)
      setPlayers(data.players)
      if (data.player_names) setPlayerNames(data.player_names)
    }

    // Refresh recovery — if sessionStorage was cleared (page reload), fetch from server
    if (!stored && !isDemo) {
      fetch(`${(process as unknown as { env: Record<string, string | undefined> }).env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/room/state?room_code=${code}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.problem_statement) setProblem(d.problem_statement)
          if (d.players) setPlayers(d.players)
          if (d.player_names) setPlayerNames(d.player_names)
          if (d.contributions) setContributions(d.contributions)
        })
        .catch(() => {})
    }

    if (isDemo) {
      if (Math.random() > 0.5) {
        setIsImpostor(true)
        setDirective("Use >= instead of > in the comparison, causing it to skip the last element when the array has an even length.")
      }
      setTimeout(() => {
        setContributions(MOCK_CONTRIBUTIONS)
        setLatestContributor("player_2")
      }, 2000)
      return
    }

    const socket = getSocket()
    if (!socket.connected) {
      socket.connect()
      // Re-join the socket room after a page refresh
      const pname = sessionStorage.getItem("player_name") ?? pid
      socket.once("connect", () => {
        socket.emit("join_room", { room_code: code, player_id: pid, player_name: pname })
      })
    }

    // Fetch directive via HTTP — more reliable than the socket event which can
    // be missed during React page navigation after game_start fires.
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/room/directive?room_code=${code}&player_id=${pid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.is_impostor && d.directive) {
          setIsImpostor(true)
          setDirective(d.directive)
        }
      })
      .catch(() => {})

    socket.on("game_start", (data: GameData) => {
      setProblem(data.problem_statement)
      setPlayers(data.players)
      if (data.player_names) setPlayerNames(data.player_names)
    })

    socket.on("impostor_directive", (data: { directive: string }) => {
      setIsImpostor(true)
      setDirective(data.directive)
    })

    socket.on("contribution_update", (data: { player_id: string; contributions: Record<string, string> }) => {
      setContributions(data.contributions)
      setLatestContributor(data.player_id)
      setSubmitting(false)
    })

    socket.on("meeting_called", (data: { caller_id: string }) => {
      const name = playerNamesRef.current[data.caller_id] ?? data.caller_id
      setCallerName(name)
      setPhase("voting")
    })

    socket.on("elimination", (data: { player_id: string }) => {
      setEliminatedPlayers((prev) => [...prev, data.player_id])
    })

    socket.on("vote_result", (data: VoteResult) => {
      sessionStorage.setItem("vote_result", JSON.stringify(data))
      router.push(`/results/${code}`)
    })

    socket.on("game_over", (data: unknown) => {
      sessionStorage.setItem("game_over", JSON.stringify(data))
      router.push(`/results/${code}`)
    })

    socket.on("finish_vote_update", (data: { votes: number; total: number; voted: string[] }) => {
      setFinishVoteCount(data.votes)
    })

    socket.on("experiment_complete", (data: ExperimentResult) => {
      sessionStorage.setItem("experiment_result", JSON.stringify(data))
      router.push(`/results/${code}`)
    })

    socket.on("error", (data: { message: string }) => {
      console.error("Socket error:", data.message)
    })

    return () => {
      socket.off("game_start")
      socket.off("impostor_directive")
      socket.off("contribution_update")
      socket.off("meeting_called")
      socket.off("elimination")
      socket.off("vote_result")
      socket.off("game_over")
      socket.off("finish_vote_update")
      socket.off("experiment_complete")
      socket.off("error")
    }
  }, [code, router, isDemo])

  function submitContribution() {
    if (!input.trim() || submitting) return
    setSubmitting(true)
    if (isDemo) {
      setContributions((prev) => ({ ...prev, [myPlayerId]: input.trim() }))
      setLatestContributor(myPlayerId)
      setSubmitting(false)
      return
    }
    const socket = getSocket()
    socket.emit("submit_contribution", { room_code: code, player_id: myPlayerId, content: input.trim() })
  }

  function voteFinish() {
    if (hasVotedFinish) return
    setHasVotedFinish(true)
    if (isDemo) {
      setFinishVoteCount((n) => n + 1)
      return
    }
    const socket = getSocket()
    socket.emit("vote_finish", { room_code: code, player_id: myPlayerId })
  }

  function callMeeting() {
    if (isDemo) {
      setCallerName(playerNames[myPlayerId] ?? "You")
      setPhase("voting")
      return
    }
    const socket = getSocket()
    socket.emit("call_meeting", { room_code: code, caller_id: myPlayerId })
  }

  function handleVoteResult(result: VoteResult) {
    sessionStorage.setItem("vote_result", JSON.stringify(result))
    router.push(`/results/${code}`)
  }

  return (
    <div className="min-h-screen flex flex-col lab-grid-bg">
      <FluidBackground speed="slow" />

      <LabHeader
        roomCode={code}
        phase={phase}
        onCallMeeting={callMeeting}
        onFinishExperiment={voteFinish}
        finishVotes={finishVoteCount}
        finishVotesNeeded={3}
        hasVotedFinish={hasVotedFinish}
        showMeetingBtn={phase === "playing"}
      />

      <div className="relative z-10 flex-1 flex flex-col gap-4 p-4 md:p-6 max-w-5xl mx-auto w-full">
        {isImpostor && directive && <ImpostorBanner directive={directive} />}

        <ProblemDisplay problem={problem} />

        {/* Live contributions — everyone's entries visible at all times */}
        <div className="rounded border p-4" style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface-hi)" }}>
          <ContributionFeed
            contributions={contributions}
            playerNames={playerNames}
            latestPlayerId={latestContributor}
          />
        </div>

        {/* Always-open input — collaborative, no turns */}
        <div
          className="rounded border p-4 flex flex-col gap-3"
          style={{ borderColor: "var(--lab-accent)", background: "var(--lab-surface-hi)", boxShadow: "0 0 12px var(--lab-accent-dim)" }}
        >
          <p className="text-[10px] font-bold tracking-widest uppercase font-[family-name:var(--font-space-mono)]" style={{ color: "var(--lab-text-dim)" }}>
            YOUR CONTRIBUTION
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={submitting}
            placeholder="Write your section of the collaborative document..."
            className="w-full px-3 py-3 rounded text-sm outline-none resize-none min-h-[120px] font-[family-name:var(--font-fira-code)] leading-relaxed"
            style={{
              background: "var(--lab-surface-hi)",
              border: "1px solid var(--lab-border-hi)",
              color: "var(--lab-text)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitContribution()
            }}
          />
          <button
            onClick={submitContribution}
            disabled={!input.trim() || submitting}
            className="w-full py-2.5 rounded text-sm font-bold tracking-widest uppercase transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-space-mono)]"
            style={{ background: "var(--lab-accent)", color: "var(--lab-void)", border: "none" }}
            onMouseEnter={(e) => { if (input.trim() && !submitting) e.currentTarget.style.boxShadow = "0 0 20px var(--lab-accent-dim)" }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none" }}
          >
            {submitting ? "SUBMITTING..." : "SUBMIT CONTRIBUTION →"}
          </button>
          <p className="text-[10px] text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)] text-center">
            ⌘ + ENTER to submit · You can update your entry at any time
          </p>
        </div>

        <PlayerStatusBar
          players={players}
          playerNames={playerNames}
          currentTurn=""
          eliminatedPlayers={eliminatedPlayers}
          myPlayerId={myPlayerId}
        />
      </div>

      {phase === "voting" && (
        <MeetingModal
          roomCode={code}
          myPlayerId={myPlayerId}
          players={players}
          playerNames={playerNames}
          eliminatedPlayers={eliminatedPlayers}
          callerName={callerName}
          onVoteResult={handleVoteResult}
          isDemo={isDemo}
        />
      )}

      <footer className="relative z-10 px-6 py-2 border-t text-[10px] tracking-widest text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] uppercase" style={{ borderColor: "var(--lab-border)" }}>
        POWERED BY K2 THINK V2 · GEMINI 2.5 PRO · MONGODB ATLAS · YHACK 2026
      </footer>
    </div>
  )
}
