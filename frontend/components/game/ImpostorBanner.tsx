"use client"

export default function ImpostorBanner({ directive }: { directive: string }) {
  return (
    <div
      className="relative rounded border p-4 animate-fade-in"
      style={{ background: "var(--lab-surface)", borderColor: "var(--lab-danger)" }}
    >
      {/* Pulsing dot */}
      <div
        className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse-danger"
        style={{ background: "var(--lab-danger)" }}
      />

      <div className="flex flex-col gap-2 pr-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest uppercase font-[family-name:var(--font-mono)] text-[var(--lab-danger)]">
            ⚠ YOU ARE THE IMPOSTOR
          </span>
        </div>

        <p className="text-sm text-[var(--lab-text)]">
          <span className="text-[10px] tracking-wider text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] mr-2">DIRECTIVE:</span>
          {directive}
        </p>

        <p className="text-[10px] text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)]">
          ONLY YOU CAN SEE THIS · MAKE YOUR CONTRIBUTIONS SUBTLY WRONG
        </p>
      </div>
    </div>
  )
}
