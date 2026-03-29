"use client"

import { useRef, MouseEvent, ReactNode, CSSProperties, HTMLAttributes } from "react"
import "./BorderGlow.css"

interface BorderGlowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  edgeSensitivity?: number
  glowColor?: string
  backgroundColor?: string
  borderRadius?: number
  glowRadius?: number
  glowIntensity?: number
  coneSpread?: number
  colors?: string[]
  fillOpacity?: number
}

export default function BorderGlow({
  children,
  className = "",
  backgroundColor = "#111822",
  borderRadius = 12,
  glowRadius = 35,
  glowIntensity = 0.8,
  colors = ["#00DFA2"],
  fillOpacity = 0.3,
  style,
  onMouseMove: externalOnMouseMove,
  onMouseEnter: externalOnMouseEnter,
  onMouseLeave: externalOnMouseLeave,
  // strip custom props not valid as HTML attrs
  edgeSensitivity: _edgeSensitivity,
  glowColor: _glowColor,
  coneSpread: _coneSpread,
  ...rest
}: BorderGlowProps) {
  const ref = useRef<HTMLDivElement>(null)

  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (el) {
      const rect = el.getBoundingClientRect()
      el.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`)
      el.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`)
    }
    externalOnMouseMove?.(e)
  }

  function onMouseEnter(e: MouseEvent<HTMLDivElement>) {
    ref.current?.style.setProperty("--bg-glow-opacity", String(glowIntensity))
    externalOnMouseEnter?.(e)
  }

  function onMouseLeave(e: MouseEvent<HTMLDivElement>) {
    ref.current?.style.setProperty("--bg-glow-opacity", "0")
    externalOnMouseLeave?.(e)
  }

  const primaryColor = colors[0] ?? "#00DFA2"

  return (
    <div
      ref={ref}
      className={`border-glow ${className}`}
      style={{
        "--mouse-x": "50%",
        "--mouse-y": "50%",
        "--bg-glow-opacity": "0",
        "--bg-glow-color": primaryColor,
        "--bg-glow-size": `${glowRadius * 3}px`,
        borderRadius: `${borderRadius}px`,
        padding: "1px",
        background: `radial-gradient(var(--bg-glow-size, 120px) circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${primaryColor}, var(--lab-border) 80%)`,
        ...style,
      } as CSSProperties}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...rest}
    >
      <div
        className="border-glow-fill"
        style={{
          background: backgroundColor,
          borderRadius: `${borderRadius - 1}px`,
        }}
      />
      <div className="border-glow-children">{children}</div>
    </div>
  )
}
