"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import BorderGlow from "@/components/ui/BorderGlow"

export default function JoinRoom() {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  async function handleJoin() {
    if (!name.trim()) { setError("Enter your name"); return }
    if (!code.trim() || code.trim().length < 4) { setError("Enter a valid room code"); return }
    setLoading(true)
    setError("")
    try {
      const playerId = crypto.randomUUID()
      localStorage.setItem("player_id", playerId)
      localStorage.setItem("player_name", name.trim())

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/room/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_code: code.trim().toUpperCase(), player_id: playerId, player_name: name.trim() }),
      })

      if (!res.ok) throw new Error("Room not found")
      router.push(`/room/${code.trim().toUpperCase()}`)
    } catch {
      router.push(`/room/${code.trim().toUpperCase()}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <BorderGlow
      backgroundColor="#111822"
      borderRadius={8}
      glowRadius={35}
      glowIntensity={0.8}
      colors={["#00DFA2", "#00B87A", "#3399FF"]}
      fillOpacity={0.3}
      className="p-6"
      data-string="impulse"
      data-string-position-strength="2"
      data-string-rotation-strength="0.5"
      data-string-rotation-max-angle="8"
      data-string-max-offset="15"
      data-string-position-friction="0.2"
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] mb-1">
            JOIN ACTIVE LAB
          </p>
          <p className="text-[var(--lab-text-dim)] text-sm">Enter a room code to join an existing session.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)]">
            RESEARCHER ID
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name..."
            className="w-full px-3 py-2 rounded text-sm outline-none transition-colors"
            style={{ background: "var(--lab-surface-hi)", border: "1px solid var(--lab-border-hi)", color: "var(--lab-text)" }}
            onFocus={(e) => { e.target.style.borderColor = "var(--lab-accent)" }}
            onBlur={(e) => { e.target.style.borderColor = "var(--lab-border-hi)" }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)]">
            LAB ACCESS CODE
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="XXXXXX"
            maxLength={8}
            className="w-full px-3 py-2 rounded text-sm outline-none uppercase tracking-widest font-[family-name:var(--font-mono)]"
            style={{ background: "var(--lab-surface-hi)", border: "1px solid var(--lab-border-hi)", color: "var(--lab-accent)" }}
            onFocus={(e) => { e.target.style.borderColor = "var(--lab-accent)" }}
            onBlur={(e) => { e.target.style.borderColor = "var(--lab-border-hi)" }}
          />
          {error && <p className="text-xs text-[var(--lab-danger)]">{error}</p>}
        </div>

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
            onClick={handleJoin}
            disabled={loading}
            className="w-full py-2.5 rounded text-sm font-bold tracking-widest uppercase transition-all cursor-pointer disabled:opacity-50 font-[family-name:var(--font-mono)]"
            style={{ background: "var(--lab-surface-hi)", color: "var(--lab-text)", border: "1px solid var(--lab-border-hi)" }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = "var(--lab-accent)"; e.currentTarget.style.color = "var(--lab-accent)" }}}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--lab-border-hi)"; e.currentTarget.style.color = "var(--lab-text)" }}
          >
            {loading ? "CONNECTING..." : "JOIN LAB →"}
          </button>
        </BorderGlow>
      </div>
    </BorderGlow>
  )
}
