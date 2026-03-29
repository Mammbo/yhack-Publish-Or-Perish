"use client"

import BorderGlow from "@/components/ui/BorderGlow"
import StatusBadge from "@/components/shared/StatusBadge"

function nameToColor(name: string): string {
  const colors = [
    "#00DFA2", "#3399FF", "#FFB020", "#FF3355",
    "#A855F7", "#06B6D4", "#F97316", "#84CC16",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

interface PlayerCardProps {
  name: string
  playerId: string
  isHost: boolean
  isMe: boolean
  isConnected: boolean
}

export default function PlayerCard({ name, isHost, isMe, isConnected }: PlayerCardProps) {
  const color = nameToColor(name)

  return (
    <BorderGlow
      backgroundColor="#111822"
      borderRadius={8}
      glowRadius={25}
      glowIntensity={0.6}
      colors={[color, "#00DFA2"]}
      fillOpacity={0.3}
      className="animate-slide-up-fade"
      data-string="impulse"
      data-string-position-strength="1.5"
      data-string-rotation-strength="0.4"
      data-string-rotation-max-angle="6"
      data-string-max-offset="12"
      data-string-position-friction="0.2"
    >
      <div className="p-4 flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: `${color}22`, border: `1.5px solid ${color}`, color }}
        >
          {initials(name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--lab-text)] truncate">
              {name}
            </span>
            {isMe && <StatusBadge label="YOU" variant="accent" />}
            {isHost && <StatusBadge label="HOST" variant="info" />}
          </div>
        </div>

        {/* Connection dot */}
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? "animate-pulse-dot" : ""}`}
          style={{ background: isConnected ? "var(--lab-accent)" : "var(--lab-text-dim)" }}
        />
      </div>
    </BorderGlow>
  )
}
