"use client"

export async function initStringTune() {
  if (typeof window === "undefined") return
  try {
    const { StringTune } = await import("@fiddle-digital/string-tune")
    const tune = StringTune.getInstance()
    tune.start(0)
    return tune
  } catch (e) {
    console.warn("StringTune failed to initialize:", e)
  }
}
