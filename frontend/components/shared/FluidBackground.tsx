"use client"

import dynamic from "next/dynamic"

const LiquidEther = dynamic(() => import("@/components/ui/LiquidEther"), { ssr: false })

interface FluidBackgroundProps {
  speed?: "normal" | "slow"
}

export default function FluidBackground({ speed = "normal" }: FluidBackgroundProps) {
  const isSlow = speed === "slow"

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.4 }}
    >
      <LiquidEther
        colors={["#00DFA2", "#0B1018", "#182030"]}
        mouseForce={isSlow ? 5 : 20}
        cursorSize={isSlow ? 60 : 100}
        isViscous
        viscous={isSlow ? 40 : 21}
        iterationsViscous={isSlow ? 16 : 32}
        iterationsPoisson={isSlow ? 16 : 32}
        resolution={isSlow ? 0.3 : 0.5}
        isBounce={false}
        autoDemo
        autoSpeed={isSlow ? 0.15 : 0.5}
        autoIntensity={isSlow ? 0.8 : 2.2}
        takeoverDuration={0.25}
        autoResumeDelay={3000}
        autoRampDuration={0.6}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  )
}
