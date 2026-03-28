"use client"

interface CornerMarkersProps {
  children: React.ReactNode
  className?: string
  color?: string
  style?: React.CSSProperties
  [key: string]: unknown
}

export default function CornerMarkers({ children, className = "", color, style: propStyle, ...rest }: CornerMarkersProps) {
  const colorStyle = color ? ({ "--lab-border-hi": color } as React.CSSProperties) : {}
  const style = { ...colorStyle, ...propStyle }
  return (
    <div className={`corner-markers-full relative ${className}`} style={style} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
      <span className="cm-tl" />
      <span className="cm-tr" />
      <span className="cm-bl" />
      <span className="cm-br" />
      {children}
    </div>
  )
}
