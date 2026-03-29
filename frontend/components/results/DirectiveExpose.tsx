"use client"

export default function DirectiveExpose({ directive }: { directive: string }) {
  return (
    <div
      className="relative rounded border p-6 max-w-lg w-full animate-slide-up"
      style={{ borderColor: "var(--lab-danger)", background: "var(--lab-surface)" }}
    >
      {/* FALSIFIED DATA stamp */}
      <div
        className="absolute top-3 right-4 opacity-30 select-none pointer-events-none"
        style={{
          transform: "rotate(8deg)",
          color: "var(--lab-danger)",
          fontFamily: "var(--font-mono), monospace",
          fontSize: "0.65rem",
          fontWeight: 700,
          letterSpacing: "0.2em",
          border: "1px solid var(--lab-danger)",
          padding: "2px 8px",
        }}
      >
        FALSIFIED DATA
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-[10px] font-bold tracking-widest uppercase font-[family-name:var(--font-mono)]" style={{ color: "var(--lab-danger)" }}>
          HIDDEN DIRECTIVE EXPOSED:
        </p>
        <p className="text-sm leading-relaxed text-[var(--lab-text)] italic">
          &ldquo;{directive}&rdquo;
        </p>
        <p className="text-[10px] text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)]">
          THIS IS HOW THEY WERE SABOTAGING YOUR RESEARCH
        </p>
      </div>
    </div>
  )
}
