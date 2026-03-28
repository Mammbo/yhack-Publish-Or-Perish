import "react"

declare module "react" {
  interface HTMLAttributes<T> {
    "string"?: string
    "string-parallax"?: string
    "string-radius"?: string
    "string-strength"?: string
    "string-inview"?: boolean | string
    "string-speed"?: string
    "string-delay"?: string
    "string-easing"?: string
  }
}
