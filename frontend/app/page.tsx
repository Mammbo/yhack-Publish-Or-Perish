"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { initStringTune } from "@/lib/stringtune"

const ASCIIText = dynamic(() => import("@/components/ui/ASCIIText"), { ssr: false })
import CreateRoom from "@/components/landing/CreateRoom"
import JoinRoom from "@/components/landing/JoinRoom"
import FluidBackground from "@/components/shared/FluidBackground"
import BorderGlow from "@/components/ui/BorderGlow"

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
        <BorderGlow
          backgroundColor="#111822"
          borderRadius={12}
          glowRadius={50}
          glowIntensity={0.7}
          colors={["#00DFA2", "#3399FF"]}
          fillOpacity={0.3}
        >
        <div className="flex flex-col items-center gap-2 text-center w-full px-10 py-8">
          <h1
            className="font-[family-name:var(--font-display)] uppercase tracking-[0.15em] leading-none text-[68px] md:text-[80px] font-semibold text-[var(--lab-text)]"
            style={{ fontVariationSettings: "'GRAD' 140", textShadow: "0 0 40px var(--lab-accent-dim)" }}
          >
            PUBLISH
          </h1>

          <span
            className="font-[family-name:var(--font-display)] uppercase tracking-[0.15em] text-[68px] md:text-[80px] font-semibold text-[var(--lab-accent)]"
            style={{ fontVariationSettings: "'GRAD' 140" }}
          >
            OR
          </span>

          {/* PERISH — ASCIIText effect */}
          <div className="relative w-full" style={{ height: "clamp(120px, 18vw, 200px)" }}>
            <ASCIIText
              text="PERISH"
              asciiFontSize={6}
              textFontSize={280}
              textColor="#D8DEE9"
              planeBaseHeight={9}
              enableWaves
            />
          </div>

        </div>
        </BorderGlow>

        <BorderGlow
          backgroundColor="#111822"
          borderRadius={8}
          glowRadius={25}
          glowIntensity={0.4}
          colors={["#00DFA2", "#3399FF"]}
          fillOpacity={0.3}
        >
          <div className="flex flex-col items-center gap-3 px-8 py-5 text-center">
            <div className="relative flex items-center w-48">
              <div className="flex-1 h-px" style={{ background: "var(--lab-border-hi)" }} />
              <div className="mx-2 w-2 h-2 rotate-45" style={{ background: "var(--lab-accent)", flexShrink: 0 }} />
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
        </BorderGlow>

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
        <BorderGlow
          backgroundColor="#111822"
          borderRadius={8}
          glowRadius={25}
          glowIntensity={0.5}
          colors={["#00DFA2", "#3399FF"]}
          fillOpacity={0.3}
        >
          <div className="flex flex-col items-center gap-2 w-full max-w-xs px-6 py-4">
            <div className="flex gap-1 w-full">
              {["SUBMITTED", "UNDER REVIEW", "REVISION", "ACCEPTED", "PUBLISHED"].map((s, i) => (
                <div key={s} className={`pub-status-segment ${i === 0 ? "active" : ""}`} />
              ))}
            </div>
            <p className="text-[9px] tracking-widest text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] uppercase">
              PUBLICATION STATUS
            </p>
          </div>
        </BorderGlow>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 py-4" style={{ background: "var(--lab-surface)", borderTop: "1px solid var(--lab-border)" }}>
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
