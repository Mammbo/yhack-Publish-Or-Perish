"use client"

import Timer from "./Timer"
import StatusBadge from "./StatusBadge"
import BorderGlow from "@/components/ui/BorderGlow"

interface LabHeaderProps {
  roomCode?: string
  phase?: string
  timerSeconds?: number | null
  onCallMeeting?: () => void
  showMeetingBtn?: boolean
  onFinishExperiment?: () => void
  finishVotes?: number
  finishVotesNeeded?: number
  hasVotedFinish?: boolean
}

export default function LabHeader({
  roomCode,
  phase,
  timerSeconds,
  onCallMeeting,
  showMeetingBtn = false,
  onFinishExperiment,
  finishVotes = 0,
  finishVotesNeeded = 3,
  hasVotedFinish = false,
}: LabHeaderProps) {
  return (
    <header
      className="flex items-center justify-between px-6 py-3 border-b lab-scanlines"
      style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)" }}
    >
      <div className="flex items-center gap-4">
        <span className="font-[family-name:var(--font-mono)] text-[var(--lab-accent)] text-sm font-bold tracking-widest">
          PUBLISH<span className="text-[var(--lab-text-dim)]"> OR </span>PERISH
        </span>
        {roomCode && (
          <span className="data-readout text-xs text-[var(--lab-text-dim)]">
            ROOM·{roomCode.split("").join("·")}
          </span>
        )}
        {phase && (
          <StatusBadge
            label={phase.toUpperCase()}
            variant={phase === "voting" ? "danger" : phase === "playing" ? "accent" : "default"}
          />
        )}
      </div>

      <div className="flex items-center gap-4">
        {timerSeconds != null && <Timer seconds={timerSeconds} />}
        {showMeetingBtn && onFinishExperiment && (
          <button
            onClick={onFinishExperiment}
            disabled={hasVotedFinish}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold tracking-widest uppercase border rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-[family-name:var(--font-mono)]"
            style={{
              borderColor: "var(--lab-info)",
              color: "var(--lab-info)",
              background: hasVotedFinish ? "rgba(51,153,255,0.15)" : "rgba(51,153,255,0.05)",
            }}
          >
            {hasVotedFinish
              ? `✓ VOTED (${finishVotes}/${finishVotesNeeded})`
              : `FINISH EXPERIMENT (${finishVotes}/${finishVotesNeeded})`}
          </button>
        )}
        {showMeetingBtn && onCallMeeting && (
          <BorderGlow
            backgroundColor="transparent"
            borderRadius={6}
            glowRadius={20}
            glowIntensity={1.0}
            colors={["#FF3355", "#FF5577", "#FF2244"]}
            fillOpacity={0.2}
          >
            <button
              data-string="magnetic"
              data-string-radius="200"
              data-string-strength="0.6"
              onClick={onCallMeeting}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold tracking-widest uppercase border rounded transition-colors cursor-pointer font-[family-name:var(--font-mono)]"
              style={{
                borderColor: "var(--lab-danger)",
                color: "var(--lab-danger)",
                background: "var(--lab-danger-dim)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,51,85,0.15)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--lab-danger-dim)"
              }}
            >
              <span className="animate-pulse-dot w-1.5 h-1.5 rounded-full bg-[var(--lab-danger)] inline-block" />
              CALL LAB MEETING
            </button>
          </BorderGlow>
        )}
      </div>
    </header>
  )
}
