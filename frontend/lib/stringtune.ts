"use client"

import StringTune, {
  StringProgress,
  StringParallax,
  StringMagnetic,
  StringSplit,
  StringCursor,
  StringImpulse,
  StringSpotlight,
  StringGlide,
  StringLerp,
} from "@fiddle-digital/string-tune"

let initialized = false

export function initStringTune() {
  if (initialized || typeof window === "undefined") return null

  try {
    const tune = StringTune.getInstance()

    tune.setupSettings({
      "offset-top": "-10vh",
      "offset-bottom": "-10vh",
      parallax: 0.2,
      lerp: 0.08,
      strength: 0.5,
    })

    tune.use(StringProgress)
    tune.use(StringParallax)
    tune.use(StringMagnetic)
    tune.use(StringSplit)
    tune.use(StringCursor, { lerp: 0.12 })
    tune.use(StringImpulse)
    tune.use(StringSpotlight)
    tune.use(StringGlide)
    tune.use(StringLerp)

    tune.speed = 0.1
    tune.speedAccelerate = 0.3
    tune.start(0)

    initialized = true
    return tune
  } catch (e) {
    console.warn("StringTune failed to initialize:", e)
    return null
  }
}
