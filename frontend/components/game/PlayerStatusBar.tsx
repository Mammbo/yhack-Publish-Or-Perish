"use client"

interface PlayerStatusBarProps {
  players: string[]
  playerNames: Record<string, string>
  currentTurn: string
  eliminatedPlayers: string[]
  myPlayerId: string
}

export default function PlayerStatusBar({
  players,
  playerNames,
  currentTurn,
  eliminatedPlayers,
  myPlayerId,
}: PlayerStatusBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 py-3 px-4 border rounded" style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)" }}>
      <span className="text-[9px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)]">
        TEAM:
      </span>
      {players.map((pid) => {
        const isActive = pid === currentTurn
        const isEliminated = eliminatedPlayers.includes(pid)
        const isMe = pid === myPlayerId
        const name = playerNames[pid] ?? pid

        return (
          <div key={pid} className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "animate-pulse-dot" : ""}`}
              style={{
                background: isEliminated
                  ? "var(--lab-text-dim)"
                  : isActive
                  ? "var(--lab-accent)"
                  : "rgba(0,223,162,0.3)",
              }}
            />
            <span
              className="text-xs font-[family-name:var(--font-space-mono)]"
              style={{
                color: isEliminated
                  ? "var(--lab-text-dim)"
                  : isActive
                  ? "var(--lab-accent)"
                  : "var(--lab-text)",
                textDecoration: isEliminated ? "line-through" : "none",
                fontWeight: isActive ? "700" : "400",
              }}
            >
              {name}{isMe ? " (YOU)" : ""}
            </span>
            {isActive && (
              <span className="text-[9px] tracking-widest text-[var(--lab-accent)] font-[family-name:var(--font-space-mono)]">
                ◀ TURN
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
