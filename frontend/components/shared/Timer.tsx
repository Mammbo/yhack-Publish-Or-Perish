"use client"

import { useEffect, useState } from "react"

interface TimerProps {
  seconds: number
  onExpire?: () => void
  className?: string
}

export default function Timer({ seconds, onExpire, className = "" }: TimerProps) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    setRemaining(seconds)
  }, [seconds])

  useEffect(() => {
    if (remaining <= 0) {
      onExpire?.()
      return
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(id)
  }, [remaining, onExpire])

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0")
  const ss = String(remaining % 60).padStart(2, "0")

  const colorClass =
    remaining <= 5
      ? "animate-timer-danger"
      : remaining <= 15
      ? "animate-timer-warn"
      : "text-[var(--lab-text)]"

  return (
    <span
      className={`font-[family-name:var(--font-space-mono)] tabular-nums tracking-widest text-sm ${colorClass} ${className}`}
    >
      {mm}:{ss}
    </span>
  )
}
