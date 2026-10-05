import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import type { BulletinStory } from '../../../src/bulletin/manifest'
import { categoryStyle, COLORS, FONT_SERIF, REEL_SAFE } from '../theme'

export const REEL_IMAGE_HEIGHT = 560
const WIDTH = 1080
const EXIT_FRAMES = 12

function cardImageUrl(url: string): string {
  return `${url}?w=${WIDTH * 2}&h=${REEL_IMAGE_HEIGHT * 2}&fit=crop&auto=format`
}

/**
 * One story in the reel's top panel. It lives inside a Sequence spanning its story;
 * the first card arrives with the panel and the last one leaves with it, so those
 * skip their own slide.
 */
export const ReelCard = ({
  story,
  index,
  total,
  enters,
  exitsAt,
}: {
  story: BulletinStory
  index: number
  total: number
  enters: boolean
  /** Frame (within the Sequence) at which the card slides out, or null to stay. */
  exitsAt: number | null
}) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const category = categoryStyle(story.category)

  const enter = enters ? spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) }) : 1
  const exit =
    exitsAt === null
      ? 0
      : interpolate(frame, [exitsAt - EXIT_FRAMES, exitsAt], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const translateX = interpolate(enter, [0, 1], [WIDTH, 0]) - exit * 160
  const imageScale = interpolate(frame, [0, durationInFrames], [1.04, 1.12])

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper, transform: `translateX(${translateX}px)`, opacity: 1 - exit }}>
      <div style={{ position: 'relative', height: REEL_IMAGE_HEIGHT, overflow: 'hidden', backgroundColor: category.color }}>
        {story.imageUrl && (
          <Img
            src={cardImageUrl(story.imageUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${imageScale})` }}
          />
        )}
        {/* Bottom of the image: its top edge sits under Instagram's status bar and icons. */}
        <div
          style={{
            position: 'absolute',
            left: REEL_SAFE.x,
            bottom: 24,
            padding: '8px 18px',
            borderRadius: 6,
            backgroundColor: category.color,
            color: '#fff',
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: 'uppercase',
            boxShadow: `0 6px 18px ${COLORS.shadow}`,
          }}
        >
          {category.label}
        </div>
        <div
          style={{
            position: 'absolute',
            right: REEL_SAFE.x,
            bottom: 24,
            padding: '6px 16px',
            borderRadius: 999,
            backgroundColor: 'rgba(29, 27, 25, 0.72)',
            color: COLORS.paper,
            fontSize: 28,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {index + 1} / {total}
        </div>
      </div>

      <div style={{ height: 8, backgroundColor: category.color }} />

      <div style={{ padding: `30px ${REEL_SAFE.x}px 0` }}>
        <div
          style={{
            color: COLORS.ink,
            fontFamily: FONT_SERIF,
            // Sized so three lines still fit the headlines they did before the safe-zone margins.
            fontSize: 48,
            fontWeight: 700,
            lineHeight: 1.14,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {story.title}
        </div>
        {story.journalist && (
          <div style={{ marginTop: 12, color: COLORS.inkMuted, fontSize: 26 }}>Von {story.journalist}</div>
        )}
      </div>
    </AbsoluteFill>
  )
}
