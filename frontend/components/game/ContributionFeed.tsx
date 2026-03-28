"use client"

import { useEffect, useRef } from "react"

interface ContributionFeedProps {
  contributions: Record<string, string>
  playerNames: Record<string, string>
  latestPlayerId?: string
}

export default function ContributionFeed({ contributions, playerNames, latestPlayerId }: ContributionFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const entries = Object.entries(contributions)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [entries.length])

  return (
    <div className="flex flex-col gap-2 overflow-y-auto max-h-80 pr-1">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)] mb-1 sticky top-0" style={{ background: "var(--lab-bg)" }}>
        CONTRIBUTIONS
      </p>

      {entries.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-xs text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)]">
            NO CONTRIBUTIONS YET — FIRST TURN IN PROGRESS
          </p>
        </div>
      ) : (
        entries.map(([pid, text]) => {
          const isLatest = pid === latestPlayerId
          return (
            <div
              key={pid}
              className="rounded border p-3 animate-slide-up-fade transition-colors"
              style={{
                borderColor: isLatest ? "var(--lab-accent)" : "var(--lab-border)",
                background: isLatest ? "rgba(0,223,162,0.04)" : "var(--lab-surface)",
                borderLeft: isLatest ? "2px solid var(--lab-accent)" : `1px solid var(--lab-border)`,
              }}
            >
              <p className="text-[10px] font-[family-name:var(--font-space-mono)] tracking-widest mb-1.5" style={{ color: "var(--lab-text-dim)" }}>
                {playerNames[pid] ?? pid}
              </p>
              <pre className="text-sm whitespace-pre-wrap font-[family-name:var(--font-fira-code)] text-[var(--lab-text)] leading-relaxed">
                {text}
              </pre>
            </div>
          )
        })
      )}
      <div ref={bottomRef} />
    </div>
  )
}
