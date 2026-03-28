"use client"

import { useEffect, useState, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getSocket } from "@/lib/socket"
import { VoteResult, MOCK_CONTRIBUTIONS } from "@/types/game"
import LabHeader from "@/components/shared/LabHeader"
import ImpostorBanner from "@/components/game/ImpostorBanner"
import ProblemDisplay from "@/components/game/ProblemDisplay"
import ContributionFeed from "@/components/game/ContributionFeed"
import ContributionInput from "@/components/game/ContributionInput"
import PlayerStatusBar from "@/components/game/PlayerStatusBar"
import MeetingModal from "@/components/meeting/MeetingModal"

interface GameData {
  problem_statement: string
  players: string[]
  first_turn: string
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
  const [currentTurn, setCurrentTurn] = useState("")
  const [contributions, setContributions] = useState<Record<string, string>>({})
  const [latestContributor, setLatestContributor] = useState<string | undefined>()
  const [isImpostor, setIsImpostor] = useState(false)
  const [directive, setDirective] = useState<string | null>(null)
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null)
  const [phase, setPhase] = useState<"playing" | "voting">("playing")
  const [eliminatedPlayers, setEliminatedPlayers] = useState<string[]>([])
  const [callerName, setCallerName] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // Collaborative model — no turns. Anyone can submit/update at any time.
  const isMyTurn = !submitted

  useEffect(() => {
    const pid = localStorage.getItem("player_id") ?? ""
    setMyPlayerId(pid)

    // Load game start data from sessionStorage
    const stored = sessionStorage.getItem("game_start")
    if (stored) {
      const data: GameData = JSON.parse(stored)
      setProblem(data.problem_statement)
      setPlayers(data.players)
      setCurrentTurn(data.first_turn)
      if (data.player_names) setPlayerNames(data.player_names)
    }

    if (isDemo) {
      // Simulate impostor directive for demo
      if (Math.random() > 0.5) {
        setIsImpostor(true)
        setDirective("Use >= instead of > in the comparison, causing it to skip the last element when the array has an even length.")
      }
      // Simulate some contributions
      setTimeout(() => {
        setContributions(MOCK_CONTRIBUTIONS)
        setLatestContributor("player_2")
      }, 2000)
      return
    }

    const socket = getSocket()
    if (!socket.connected) socket.connect()

    socket.on("game_start", (data: GameData) => {
      setProblem(data.problem_statement)
      setPlayers(data.players)
      setCurrentTurn(data.first_turn)
      if (data.player_names) setPlayerNames(data.player_names)
    })

    socket.on("impostor_directive", (data: { directive: string }) => {
      setIsImpostor(true)
      setDirective(data.directive)
    })

    socket.on("contribution_update", (data: { player_id: string; contributions: Record<string, string> }) => {
      setContributions(data.contributions)
      setLatestContributor(data.player_id)
      setSubmitted(false)
    })

    socket.on("turn_update", (data: { current_player_id: string; time_remaining?: number }) => {
      setCurrentTurn(data.current_player_id)
      setTimerSeconds(data.time_remaining ?? null)
      setSubmitted(false)
    })

    socket.on("meeting_called", (data: { caller_id: string }) => {
      const name = playerNames[data.caller_id] ?? data.caller_id
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

    socket.on("error", (data: { message: string }) => {
      console.error("Socket error:", data.message)
    })

    return () => {
      socket.off("game_start")
      socket.off("impostor_directive")
      socket.off("contribution_update")
      socket.off("turn_update")
      socket.off("meeting_called")
      socket.off("elimination")
      socket.off("vote_result")
      socket.off("game_over")
      socket.off("error")
    }
  }, [code, router, isDemo, playerNames])

  function submitContribution(content: string) {
    setSubmitted(true)
    if (isDemo) {
      setContributions((prev) => ({ ...prev, [myPlayerId]: content }))
      setLatestContributor(myPlayerId)
      // Simulate turn advance
      setTimeout(() => {
        const nextIdx = (players.indexOf(myPlayerId) + 1) % players.length
        setCurrentTurn(players[nextIdx])
        setSubmitted(false)
      }, 1500)
      return
    }
    const socket = getSocket()
    socket.emit("submit_contribution", { room_code: code, player_id: myPlayerId, content })
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

  const currentPlayerName = playerNames[currentTurn] ?? currentTurn

  return (
    <div className="min-h-screen flex flex-col lab-grid-bg">
      <LabHeader
        roomCode={code}
        phase={phase}
        timerSeconds={timerSeconds ?? undefined}
        onCallMeeting={callMeeting}
        showMeetingBtn={phase === "playing"}
      />

      <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 max-w-7xl mx-auto w-full">
        {/* Impostor banner */}
        {isImpostor && directive && <ImpostorBanner directive={directive} />}

        {/* Problem statement */}
        <ProblemDisplay problem={problem} />

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
          {/* Contributions feed */}
          <div
            className="rounded border p-4"
            style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)" }}
          >
            <ContributionFeed
              contributions={contributions}
              playerNames={playerNames}
              latestPlayerId={latestContributor}
            />
          </div>

          {/* Input area */}
          <div
            className="rounded border p-4"
            style={{ borderColor: isMyTurn ? "var(--lab-accent)" : "var(--lab-border)", background: "var(--lab-surface)", transition: "border-color 0.3s ease" }}
          >
            <ContributionInput
              isMyTurn={isMyTurn}
              currentPlayerName={currentPlayerName}
              onSubmit={submitContribution}
              disabled={submitted}
            />
          </div>
        </div>

        {/* Player status bar */}
        <PlayerStatusBar
          players={players}
          playerNames={playerNames}
          currentTurn={currentTurn}
          eliminatedPlayers={eliminatedPlayers}
          myPlayerId={myPlayerId}
        />
      </div>

      {/* Meeting modal */}
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

      <footer className="px-6 py-2 border-t text-[10px] tracking-widest text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)] uppercase" style={{ borderColor: "var(--lab-border)" }}>
        POWERED BY K2 THINK V2 · GEMINI 2.5 PRO · MONGODB ATLAS · YHACK 2026
      </footer>
    </div>
  )
}
