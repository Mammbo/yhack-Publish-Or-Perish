"use client"

import { useState, useEffect } from "react"

interface SpyRevealProps {
  impostorName: string
  wasImpostor: boolean
}

export default function SpyReveal({ impostorName, wasImpostor }: SpyRevealProps) {
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), 1000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Flip card */}
      <div className="w-64 h-40" style={{ perspective: "1000px" }}>
        <div className={`flip-card-inner relative w-full h-full ${flipped ? "flipped" : ""}`}>
          {/* Front — back of card */}
          <div
            className="flip-card-face absolute inset-0 rounded border flex flex-col items-center justify-center gap-2"
            style={{ background: "var(--lab-danger-dim)", borderColor: "var(--lab-danger)" }}
          >
            <span className="text-4xl font-bold font-[family-name:var(--font-space-mono)]" style={{ color: "var(--lab-danger)" }}>?</span>
            <p className="text-[10px] tracking-widest text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)] uppercase">
              IDENTITY UNKNOWN
            </p>
          </div>

          {/* Back — identity reveal */}
          <div
            className="flip-card-face flip-card-back absolute inset-0 rounded border flex flex-col items-center justify-center gap-3 p-4"
            style={{ background: "var(--lab-surface)", borderColor: wasImpostor ? "var(--lab-danger)" : "var(--lab-warn)" }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-2"
              style={{
                background: "rgba(255,51,85,0.1)",
                borderColor: "var(--lab-danger)",
                color: "var(--lab-danger)",
              }}
            >
              {impostorName.slice(0, 2).toUpperCase()}
            </div>
            <p className="font-[family-name:var(--font-space-mono)] text-sm font-bold tracking-wider text-[var(--lab-text)]">
              {impostorName}
            </p>
            <div className="classified-stamp text-base">CLASSIFIED</div>
          </div>
        </div>
      </div>
    </div>
  )
}
