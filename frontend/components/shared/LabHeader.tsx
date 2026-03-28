"use client"

import Timer from "./Timer"
import StatusBadge from "./StatusBadge"

interface LabHeaderProps {
  roomCode?: string
  phase?: string
  timerSeconds?: number | null
  onCallMeeting?: () => void
  showMeetingBtn?: boolean
}

export default function LabHeader({
  roomCode,
  phase,
  timerSeconds,
  onCallMeeting,
  showMeetingBtn = false,
}: LabHeaderProps) {
  return (
    <header
      className="flex items-center justify-between px-6 py-3 border-b lab-scanlines"
      style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)" }}
    >
      <div className="flex items-center gap-4">
        <span className="font-[family-name:var(--font-space-mono)] text-[var(--lab-accent)] text-sm font-bold tracking-widest">
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
        {showMeetingBtn && onCallMeeting && (
          <button
            onClick={onCallMeeting}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold tracking-widest uppercase border rounded transition-colors cursor-pointer font-[family-name:var(--font-space-mono)]"
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
        )}
      </div>
    </header>
  )
}
