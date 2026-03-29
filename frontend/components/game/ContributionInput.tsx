"use client"

import { useState } from "react"
import BorderGlow from "@/components/ui/BorderGlow"

interface ContributionInputProps {
  isMyTurn: boolean
  currentPlayerName: string
  onSubmit: (content: string) => void
  disabled?: boolean
}

export default function ContributionInput({
  isMyTurn,
  currentPlayerName,
  onSubmit,
  disabled = false,
}: ContributionInputProps) {
  const [input, setInput] = useState("")
  const [confirming, setConfirming] = useState(false)

  function handleSubmitClick() {
    if (!input.trim()) return
    setConfirming(true)
  }

  function handleConfirm() {
    onSubmit(input.trim())
    setInput("")
    setConfirming(false)
  }

  function handleCancel() {
    setConfirming(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-bold tracking-widest uppercase font-[family-name:var(--font-mono)]" style={{ color: "var(--lab-text-dim)" }}>
        YOUR CONTRIBUTION
      </p>

      {!isMyTurn ? (
        <div
          className="rounded border p-4 flex items-center justify-center min-h-[120px]"
          style={{ borderColor: "var(--lab-border)", background: "var(--lab-surface)" }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="w-3 h-3 rounded-full animate-pulse-dot" style={{ background: "var(--lab-accent)" }} />
            <p className="text-xs text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)] tracking-wider">
              SUBMITTING...
            </p>
          </div>
        </div>
      ) : (
        <>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={disabled || confirming}
            placeholder="Write your contribution to the experiment..."
            className="w-full px-3 py-3 rounded text-sm outline-none resize-none min-h-[140px] transition-colors font-[family-name:var(--font-mono)] leading-relaxed"
            style={{
              background: "var(--lab-surface)",
              border: `1px solid var(--lab-accent)`,
              color: "var(--lab-text)",
              boxShadow: "0 0 12px var(--lab-accent-dim)",
            }}
          />

          {confirming ? (
            <div className="rounded border p-3 flex flex-col gap-3" style={{ borderColor: "var(--lab-warn)", background: "rgba(255,176,32,0.06)" }}>
              <p className="text-xs text-[var(--lab-warn)] font-[family-name:var(--font-space-mono)] tracking-wider">
                ⚠ SUBMIT CONTRIBUTION? THIS WILL REPLACE YOUR CURRENT ENTRY.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-1.5 rounded text-xs font-bold tracking-widest uppercase cursor-pointer font-[family-name:var(--font-mono)]"
                  style={{ background: "var(--lab-accent)", color: "var(--lab-void)", border: "none" }}
                >
                  CONFIRM
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 py-1.5 rounded text-xs font-bold tracking-widest uppercase cursor-pointer font-[family-name:var(--font-mono)]"
                  style={{ background: "transparent", color: "var(--lab-text-dim)", border: "1px solid var(--lab-border-hi)" }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          ) : (
            <BorderGlow
              backgroundColor="transparent"
              borderRadius={6}
              glowRadius={20}
              glowIntensity={1.0}
              colors={["#00DFA2", "#00E89C", "#00B87A"]}
              fillOpacity={0.2}
            >
              <button
                data-string="magnetic"
                data-string-radius="250"
                data-string-strength="0.5"
                onClick={handleSubmitClick}
                disabled={!input.trim() || disabled}
                className="w-full py-2.5 rounded text-sm font-bold tracking-widest uppercase transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-mono)]"
                style={{ background: "var(--lab-accent)", color: "var(--lab-void)", border: "none" }}
                onMouseEnter={(e) => { if (!disabled && input.trim()) e.currentTarget.style.boxShadow = "0 0 20px var(--lab-accent-dim)" }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none" }}
              >
                SUBMIT CONTRIBUTION →
              </button>
            </BorderGlow>
          )}
        </>
      )}
    </div>
  )
}
