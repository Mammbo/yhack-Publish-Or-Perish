"use client"

import { useEffect, useRef } from "react"
import BorderGlow from "@/components/ui/BorderGlow"

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
    <div
      data-string="glide"
      className="flex flex-col gap-2 overflow-y-auto max-h-80 pr-1"
    >
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] mb-1 sticky top-0" style={{ background: "var(--lab-bg)" }}>
        CONTRIBUTIONS
      </p>

      {entries.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-xs text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)]">
            NO CONTRIBUTIONS YET — FIRST TURN IN PROGRESS
          </p>
        </div>
      ) : (
        entries.map(([pid, text]) => {
          const isLatest = pid === latestPlayerId
          return (
            <BorderGlow
              key={pid}
              backgroundColor={isLatest ? "rgba(0,223,162,0.04)" : "#111822"}
              borderRadius={6}
              glowRadius={25}
              glowIntensity={0.5}
              colors={isLatest ? ["#00DFA2"] : ["#2A3A50"]}
              fillOpacity={0.3}
              className="contribution-card animate-slide-up-fade"
              data-string="impulse"
              data-string-position-strength="1"
              data-string-rotation-strength="0.3"
              data-string-rotation-max-angle="4"
              data-string-max-offset="8"
              data-string-position-friction="0.2"
            >
              <div className="p-3">
                <p className="text-[10px] font-[family-name:var(--font-mono)] tracking-widest mb-1.5" style={{ color: "var(--lab-text-dim)" }}>
                  {playerNames[pid] ?? pid}
                </p>
                <pre className="text-sm whitespace-pre-wrap font-[family-name:var(--font-mono)] text-[var(--lab-text)] leading-relaxed">
                  {text}
                </pre>
              </div>
            </BorderGlow>
          )
        })
      )}
      <div ref={bottomRef} />
    </div>
  )
}
