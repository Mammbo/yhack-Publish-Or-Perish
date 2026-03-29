"use client"

import { useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"

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
    <div className="flex flex-col gap-3 overflow-y-auto max-h-[420px] pr-1">
      <p className="text-[10px] font-bold tracking-widest uppercase sticky top-0 font-[family-name:var(--font-space-mono)]"
        style={{ color: "var(--lab-text-dim)", background: "var(--lab-surface)" }}>
        LIVE DOCUMENT
      </p>

      {entries.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-xs font-[family-name:var(--font-space-mono)]" style={{ color: "var(--lab-text-dim)" }}>
            NO CONTRIBUTIONS YET — BE THE FIRST TO WRITE
          </p>
        </div>
      ) : (
        entries.map(([pid, text]) => {
          const isLatest = pid === latestPlayerId
          return (
            <BorderGlow
              key={pid}
              className="rounded border p-4 transition-colors"
              style={{
                borderColor: isLatest ? "var(--lab-accent)" : "var(--lab-border)",
                background: isLatest ? "rgba(0,223,162,0.04)" : "var(--lab-surface-hi)",
                borderLeft: `3px solid ${isLatest ? "var(--lab-accent)" : "var(--lab-border)"}`,
              }}
            >
              <p className="text-[10px] font-[family-name:var(--font-space-mono)] tracking-widest mb-2"
                style={{ color: isLatest ? "var(--lab-accent)" : "var(--lab-text-dim)" }}>
                {playerNames[pid] ?? pid}
              </p>
              <div className="markdown-body text-sm leading-relaxed" style={{ color: "var(--lab-text)" }}>
                <ReactMarkdown>{text}</ReactMarkdown>
              </div>
            </BorderGlow>
          )
        })
      )}
      <div ref={bottomRef} />
    </div>
  )
}
