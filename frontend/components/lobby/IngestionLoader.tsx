"use client"

import { useEffect, useState } from "react"

// Durations match the real pipeline roughly:
// extract text → classify → gemini search → generate game → assign → done
const STEPS: { label: string; ms: number }[] = [
  { label: "SCANNING MATERIALS...",          ms: 4000  },
  { label: "CLASSIFYING RESEARCH DOMAIN...", ms: 6000  },
  { label: "ENRICHING WITH WEB CONTEXT...",  ms: 14000 },
  { label: "GENERATING EXPERIMENT PROTOCOL...", ms: 22000 },
  { label: "ASSIGNING LAB ROLES...",         ms: 5000  },
  { label: "DETECTING ANOMALIES IN THE TEAM...", ms: 4000 },
]

export default function IngestionLoader() {
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    let cancelled = false
    let step = 0

    function advance() {
      if (cancelled || step >= STEPS.length) return
      const current = step++
      setActiveStep(current)

      setTimeout(() => {
        if (cancelled) return
        setCompletedSteps((prev) => [...prev, current])
        setActiveStep(current + 1)
        if (current + 1 < STEPS.length) advance()
      }, STEPS[current].ms)
    }

    advance()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col gap-3 p-6 rounded border" style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)" }}>
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] mb-2">
        AI PIPELINE ACTIVE
      </p>
      {STEPS.map(({ label }, i) => {
        const done = completedSteps.includes(i)
        const active = activeStep === i && !done

        if (i > activeStep && !done) return null

        return (
          <div
            key={label}
            className="flex items-center gap-3 animate-slide-up-fade"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              {done ? (
                <span style={{ color: "var(--lab-accent)" }} className="text-sm font-bold">✓</span>
              ) : active ? (
                <div
                  className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "var(--lab-accent)", borderTopColor: "transparent" }}
                />
              ) : (
                <span style={{ color: "var(--lab-text-dim)" }} className="text-sm">⏳</span>
              )}
            </div>

            <span
              className="text-xs font-[family-name:var(--font-mono)] tracking-wider"
              style={{ color: done ? "var(--lab-accent)" : active ? "var(--lab-text)" : "var(--lab-text-dim)" }}
            >
              {label}
            </span>
          </div>
        )
      })}

      <div className="mt-2 text-[10px] text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)]">
        Waiting for game to begin...
      </div>
    </div>
  )
}
