import type { CSSProperties } from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS } from '../theme'

/** Brand and date bar, by default in the bottom-left corner of the 16:9 cut. */
export const LowerThird = ({
  dateLabel,
  scale = 1,
  style = { left: 56, bottom: 56 },
}: {
  dateLabel: string
  scale?: number
  style?: CSSProperties
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const enter = spring({ frame: frame - Math.round(fps * 0.4), fps, config: { damping: 200 } })
  const translateX = interpolate(enter, [0, 1], [-900, 0])

  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'stretch',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: `0 16px 40px ${COLORS.shadow}`,
        transform: `translateX(${translateX}px) scale(${scale})`,
        transformOrigin: 'bottom left',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 28px',
          backgroundColor: COLORS.brand,
          color: COLORS.paper,
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: 1,
        }}
      >
        UMBRUCH AI
      </div>
      <div style={{ padding: '14px 28px', backgroundColor: COLORS.paper }}>
        <div style={{ color: COLORS.ink, fontSize: 28, fontWeight: 800, letterSpacing: 0.4 }}>Nachrichten</div>
        <div style={{ marginTop: 2, color: COLORS.inkMuted, fontSize: 20, fontWeight: 400 }}>{dateLabel}</div>
      </div>
    </div>
  )
}
