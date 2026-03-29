"use client"

import { useState, useEffect } from "react"
import { getSocket } from "@/lib/socket"
import { VoteResult } from "@/types/game"
import BorderGlow from "@/components/ui/BorderGlow"

interface MeetingModalProps {
  roomCode: string
  myPlayerId: string
  players: string[]
  playerNames: Record<string, string>
  eliminatedPlayers: string[]
  callerName: string | null
  onVoteResult: (result: VoteResult) => void
  isDemo?: boolean
}

export default function MeetingModal({
  roomCode,
  myPlayerId,
  players,
  playerNames,
  eliminatedPlayers,
  callerName,
  onVoteResult,
  isDemo = false,
}: MeetingModalProps) {
  const [voted, setVoted] = useState(false)
  const [votedFor, setVotedFor] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(60)
  const [votesIn, setVotesIn] = useState(0)
  const [totalPlayers, setTotalPlayers] = useState(players.length)
  const socket = getSocket()

  const alivePlayers = players.filter((p) => !eliminatedPlayers.includes(p))

  useEffect(() => {
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!isDemo) {
      socket.on("vote_result", (data: VoteResult) => onVoteResult(data))
      socket.on("vote_progress", (data: { votes_in: number; total_players: number }) => {
        setVotesIn(data.votes_in)
        setTotalPlayers(data.total_players)
      })
      return () => {
        socket.off("vote_result")
        socket.off("vote_progress")
      }
    }
  }, [socket, onVoteResult, isDemo])

  function castVote(targetId: string) {
    if (voted) return
    setVoted(true)
    setVotedFor(targetId)

    if (isDemo) {
      setTimeout(() => {
        const result: VoteResult = {
          eliminated_id: targetId,
          was_impostor: Math.random() > 0.4,
          impostor_directive: "Use >= instead of > in the comparison, causing it to skip the last element when the array has an even length.",
          votes: { [targetId]: 2, [myPlayerId]: 1 },
        }
        onVoteResult(result)
      }, 2000)
    } else {
      socket.emit("cast_vote", { room_code: roomCode, voter_id: myPlayerId, target_id: targetId })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-meeting-flash"
      style={{ background: "rgba(6,10,15,0.92)" }}
    >
      <BorderGlow
        backgroundColor="#111822"
        borderRadius={8}
        glowRadius={40}
        glowIntensity={0.9}
        colors={["#FF3355", "#FF5577", "#FF2244"]}
        fillOpacity={0.3}
        className="w-full max-w-lg mx-4 animate-slide-up"
      >
        <div className="p-8 flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full animate-pulse-danger" style={{ background: "var(--lab-danger)" }} />
              <span className="font-[family-name:var(--font-mono)] text-sm font-bold tracking-widest uppercase" style={{ color: "var(--lab-danger)" }}>
                ⚠ LAB MEETING CALLED
              </span>
            </div>
            {callerName && (
              <p className="text-xs text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)]">
                CALLED BY: {callerName.toUpperCase()}
              </p>
            )}
          </div>

        {/* Timer + vote progress */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--lab-text-dim)]">Vote to eliminate a researcher</p>
            <span
              className={`font-[family-name:var(--font-space-mono)] font-bold tabular-nums text-sm ${timeLeft <= 10 ? "animate-timer-danger" : timeLeft <= 20 ? "animate-timer-warn" : ""}`}
              style={{ color: timeLeft > 20 ? "var(--lab-text)" : undefined }}
            >
              {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--lab-border)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${totalPlayers > 0 ? (votesIn / totalPlayers) * 100 : 0}%`, background: "var(--lab-warn)" }}
              />
            </div>
            <span className="text-[10px] font-[family-name:var(--font-space-mono)] tabular-nums" style={{ color: "var(--lab-warn)" }}>
              {votesIn}/{totalPlayers} VOTES
            </span>
          </div>
        </div>

          {/* Vote cards */}
          {voted ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-6 h-6 rounded-full animate-pulse-dot" style={{ background: "var(--lab-accent)" }} />
              <p className="text-sm font-[family-name:var(--font-mono)] tracking-wider" style={{ color: "var(--lab-accent)" }}>
                VOTE CAST — WAITING FOR OTHERS...
              </p>
              {votedFor && (
                <p className="text-xs text-[var(--lab-text-dim)]">
                  You voted for: {playerNames[votedFor] ?? votedFor}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {alivePlayers.map((pid) => {
                const isMe = pid === myPlayerId
                return (
                  <div key={pid} className="flex flex-col gap-2">
                    <div
                      className="p-3 rounded border flex items-center justify-between"
                      style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface-hi)" }}
                    >
                      <span className="text-sm font-[family-name:var(--font-mono)]">
                        {playerNames[pid] ?? pid}
                        {isMe && <span className="text-[10px] text-[var(--lab-text-dim)] ml-2">(YOU)</span>}
                      </span>
                    </div>
                    {!isMe && (
                      <button
                        data-string="magnetic"
                        data-string-strength="0.4"
                        onClick={() => castVote(pid)}
                        className="w-full py-1.5 rounded text-xs font-bold tracking-widest uppercase cursor-pointer transition-colors font-[family-name:var(--font-mono)]"
                        style={{
                          background: "var(--lab-danger-dim)",
                          color: "var(--lab-danger)",
                          border: "1px solid var(--lab-danger)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,51,85,0.2)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--lab-danger-dim)" }}
                      >
                        VOTE
                      </button>
                    )}
                    {isMe && (
                      <div
                        className="w-full py-1.5 rounded text-xs text-center tracking-widest uppercase font-[family-name:var(--font-mono)]"
                        style={{ color: "var(--lab-text-dim)", border: "1px solid var(--lab-border)" }}
                      >
                        YOU
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </BorderGlow>
    </div>
  )
}
