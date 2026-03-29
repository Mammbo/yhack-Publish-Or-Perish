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
      className="fixed inset-0 pointer-events-none z-[5]"
      style={{ opacity: isSlow ? 0.65 : 0.8 }}
    >
      <LiquidEther
        colors={["#00DFA2", "#00B87A", "#182030"]}
        mouseForce={isSlow ? 8 : 30}
        cursorSize={isSlow ? 80 : 120}
        isViscous
        viscous={isSlow ? 35 : 18}
        iterationsViscous={isSlow ? 16 : 32}
        iterationsPoisson={isSlow ? 16 : 32}
        resolution={isSlow ? 0.3 : 0.5}
        isBounce={false}
        autoDemo
        autoSpeed={isSlow ? 0.2 : 0.7}
        autoIntensity={isSlow ? 1.5 : 3.5}
        takeoverDuration={0.25}
        autoResumeDelay={3000}
        autoRampDuration={0.6}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  )
}
