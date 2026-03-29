"use client"

import dynamic from "next/dynamic"

const Dither = dynamic(() => import("@/components/ui/Dither"), { ssr: false })

interface FluidBackgroundProps {
  speed?: "normal" | "slow"
}

export default function FluidBackground({ speed = "normal" }: FluidBackgroundProps) {
  const isSlow = speed === "slow"

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[5]"
      style={{ opacity: isSlow ? 0.65 : 0.85 }}
    >
      <Dither
        waveColor={[0.0, 0.87, 0.64]}
        disableAnimation={false}
        enableMouseInteraction
        mouseRadius={0.5}
        colorNum={4}
        waveAmplitude={0.3}
        waveFrequency={3}
        waveSpeed={isSlow ? 0.02 : 0.04}
      />
    </div>
  )
}
