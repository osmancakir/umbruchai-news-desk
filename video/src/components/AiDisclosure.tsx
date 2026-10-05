import type { CSSProperties } from 'react'
import { COLORS } from '../theme'

/** Labels the presenter as AI-generated; `style` places it. */
export const AiDisclosure = ({ style, fontSize = 20 }: { style: CSSProperties; fontSize?: number }) => (
  <div
    style={{
      position: 'absolute',
      padding: '8px 16px',
      borderRadius: 6,
      backgroundColor: 'rgba(29, 27, 25, 0.72)',
      color: COLORS.paper,
      fontSize,
      fontWeight: 600,
      letterSpacing: 0.4,
      ...style,
    }}
  >
    KI-generierte Moderation
  </div>
)
