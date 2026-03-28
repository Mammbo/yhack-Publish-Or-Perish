"use client"

import CornerMarkers from "@/components/shared/CornerMarkers"

export default function ProblemDisplay({ problem }: { problem: string }) {
  return (
    <CornerMarkers className="p-6 rounded border lab-scanlines" style={{ borderColor: "var(--lab-border-hi)", background: "var(--lab-surface)" } as React.CSSProperties}>
      <div className="relative z-10">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-space-mono)] mb-3">
          EXPERIMENT PROTOCOL
        </p>
        <p className="text-[var(--lab-text)] leading-relaxed">
          {problem || "Loading experiment protocol..."}
        </p>
      </div>
    </CornerMarkers>
  )
}
