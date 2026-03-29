"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { initStringTune } from "@/lib/stringtune"

const ASCIIText = dynamic(() => import("@/components/ui/ASCIIText"), { ssr: false })
import CreateRoom from "@/components/landing/CreateRoom"
import JoinRoom from "@/components/landing/JoinRoom"
import FluidBackground from "@/components/shared/FluidBackground"

export default function LandingPage() {
  useEffect(() => {
    initStringTune()
  }, [])

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden lab-grid-bg hero-section">
      <FluidBackground speed="normal" />

      {/* Radial glow */}
      <div
        data-string-parallax="0.25"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, var(--lab-accent-dim) 0%, transparent 70%)",
        }}
      />

      {/* Grid layer with parallax */}
      <div
        data-string-parallax="0.1"
        className="absolute inset-0 pointer-events-none lab-grid-bg opacity-60"
      />

      {/* Particles */}
      <div data-string-parallax="0.4" className="absolute top-20 left-20 pointer-events-none">
        <div className="particles" />
      </div>
      <div data-string-parallax="0.4" className="absolute bottom-20 right-20 pointer-events-none">
        <div className="particles particles-2" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-6 flex flex-col items-center gap-10">
        {/* Title */}
        <div className="flex flex-col items-center gap-4 text-center">
          <h1
            className="hero-title font-[family-name:var(--font-display)] uppercase tracking-[0.15em] leading-none text-5xl md:text-6xl font-semibold text-[var(--lab-text)]"
            style={{
              fontVariationSettings: "'GRAD' 140",
              textShadow: "0 0 40px var(--lab-accent-dim)",
            }}
          >
            PUBLISH OR
          </h1>

          {/* PERISH — ASCIIText effect */}
          <div className="relative w-full" style={{ height: "clamp(80px, 12vw, 140px)" }}>
            <ASCIIText
              text="PERISH"
              asciiFontSize={6}
              textFontSize={200}
              textColor="#D8DEE9"
              planeBaseHeight={8}
              enableWaves
            />
          </div>

          {/* Divider with diamond */}
          <div className="relative flex items-center w-48">
            <div className="flex-1 h-px" style={{ background: "var(--lab-border-hi)" }} />
            <div
              className="mx-2 w-2 h-2 rotate-45"
              style={{ background: "var(--lab-accent)", flexShrink: 0 }}
            />
            <div className="flex-1 h-px" style={{ background: "var(--lab-border-hi)" }} />
          </div>

          <p
            data-string="split"
            data-string-split="word[start]"
            data-string-repeat
            className="text-[var(--lab-text-dim)] text-lg max-w-md"
          >
            Expose the fraud before they bring the whole lab down.
          </p>
        </div>

        {/* Action cards */}
        <div
          data-string="progress"
          data-string-id="cards-reveal"
          data-string-key="--cards-progress"
          data-string-offset-top="-20%"
          className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full"
        >
          <CreateRoom />
          <JoinRoom />
        </div>

        {/* Publication status bar — decorative */}
        <div className="flex flex-col items-center gap-2 w-full max-w-xs">
          <div className="flex gap-1 w-full">
            {["SUBMITTED", "UNDER REVIEW", "REVISION", "ACCEPTED", "PUBLISHED"].map((s, i) => (
              <div key={s} className={`pub-status-segment ${i === 0 ? "active" : ""}`} />
            ))}
          </div>
          <p className="text-[9px] tracking-widest text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] uppercase">
            PUBLICATION STATUS
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 py-4">
        <p className="text-[10px] tracking-widest text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] uppercase">
          POWERED BY K2 THINK V2 · GEMINI 2.5 PRO · MONGODB ATLAS
        </p>
        <p className="text-[10px] tracking-widest text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] uppercase">
          YHACK 2026
        </p>
      </footer>
    </main>
  )
}
