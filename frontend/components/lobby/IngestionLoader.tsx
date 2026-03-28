"use client"

import { useEffect, useState } from "react"

const STEPS = [
  "SCANNING MATERIALS...",
  "CLASSIFYING RESEARCH DOMAIN...",
  "ENRICHING WITH WEB CONTEXT...",
  "GENERATING EXPERIMENT PROTOCOL...",
  "ASSIGNING LAB ROLES...",
  "DETECTING ANOMALIES IN THE TEAM...",
]

export default function IngestionLoader() {
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    let step = 0
    const advance = () => {
      if (step >= STEPS.length) return
      const current = step
      step++
      setActiveStep(current)

      // Mark complete after 2.5s, then advance
      setTimeout(() => {
        setCompletedSteps((prev) => [...prev, current])
        setActiveStep(current + 1)
        if (current + 1 < STEPS.length) {
          setTimeout(advance, 100)
        }
      }, 2500)
    }
    advance()
  }, [])

  return (
    <div className="flex flex-col gap-3 p-6 rounded border" style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)" }}>
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)] mb-2">
        AI PIPELINE ACTIVE
      </p>
      {STEPS.map((step, i) => {
        const done = completedSteps.includes(i)
        const active = activeStep === i && !done

        if (i > activeStep && !done) return null

        return (
          <div
            key={step}
            className="flex items-center gap-3 animate-slide-up-fade"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            {/* Icon */}
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
              className="text-xs font-[family-name:var(--font-space-mono)] tracking-wider"
              style={{ color: done ? "var(--lab-accent)" : active ? "var(--lab-text)" : "var(--lab-text-dim)" }}
            >
              {step}
            </span>
          </div>
        )
      })}

      <div className="mt-2 text-[10px] text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)]">
        Waiting for game to begin...
      </div>
    </div>
  )
}
