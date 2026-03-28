"use client"

interface StatusBadgeProps {
  label: string
  variant?: "default" | "danger" | "accent" | "warn" | "info"
  className?: string
}

const variantStyles: Record<string, string> = {
  default: "border-[var(--lab-border-hi)] text-[var(--lab-text-dim)]",
  danger: "border-[var(--lab-danger)] text-[var(--lab-danger)] bg-[var(--lab-danger-dim)]",
  accent: "border-[var(--lab-accent)] text-[var(--lab-accent)] bg-[var(--lab-accent-dim)]",
  warn: "border-[var(--lab-warn)] text-[var(--lab-warn)]",
  info: "border-[var(--lab-info)] text-[var(--lab-info)]",
}

export default function StatusBadge({ label, variant = "default", className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase border rounded font-[family-name:var(--font-space-mono)] ${variantStyles[variant]} ${className}`}
    >
      {label}
    </span>
  )
}
