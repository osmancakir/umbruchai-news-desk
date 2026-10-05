import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import type { BulletinStory } from '../../../src/bulletin/manifest'
import { categoryStyle, COLORS, FONT_SERIF } from '../theme'

const CARD_WIDTH = 600
const IMAGE_HEIGHT = Math.round((CARD_WIDTH * 9) / 16)
const EXIT_FRAMES = 12

function cardImageUrl(url: string): string {
  // Sanity's image CDN crops and resizes on request; 2x for a sharp 1080p frame.
  return `${url}?w=${CARD_WIDTH * 2}&h=${IMAGE_HEIGHT * 2}&fit=crop&auto=format`
}

/** The news card in the top-right corner. It lives inside a Sequence spanning its story. */
export const NewsCard = ({ story, index, total }: { story: BulletinStory; index: number; total: number }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const category = categoryStyle(story.category)

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.7) })
  const exit = interpolate(frame, [durationInFrames - EXIT_FRAMES, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const translateX = interpolate(enter, [0, 1], [CARD_WIDTH + 120, 0]) + exit * 80
  const opacity = Math.min(enter, 1 - exit)
  // Slow push-in on the article image while the story is read.
  const imageScale = interpolate(frame, [0, durationInFrames], [1.04, 1.12])

  return (
    <div
      style={{
        position: 'absolute',
        top: 56,
        right: 56,
        width: CARD_WIDTH,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: COLORS.paper,
        boxShadow: `0 24px 60px ${COLORS.shadow}`,
        transform: `translateX(${translateX}px)`,
        opacity,
      }}
    >
      <div style={{ position: 'relative', height: IMAGE_HEIGHT, overflow: 'hidden', backgroundColor: category.color }}>
        {story.imageUrl && (
          <Img
            src={cardImageUrl(story.imageUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${imageScale})` }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            padding: '6px 12px',
            borderRadius: 999,
            backgroundColor: 'rgba(29, 27, 25, 0.72)',
            color: COLORS.paper,
            fontSize: 20,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {index + 1} / {total}
        </div>
      </div>

      <div style={{ height: 6, backgroundColor: category.color }} />

      <div style={{ padding: '22px 28px 26px' }}>
        <div
          style={{
            color: category.color,
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
          }}
        >
          {category.label}
        </div>
        <div
          style={{
            marginTop: 10,
            color: COLORS.ink,
            fontFamily: FONT_SERIF,
            fontSize: 36,
            fontWeight: 700,
            lineHeight: 1.18,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {story.title}
        </div>
        {story.journalist && (
          <div style={{ marginTop: 14, color: COLORS.inkMuted, fontSize: 20, fontWeight: 400 }}>
            Von {story.journalist}
          </div>
        )}
      </div>
    </div>
  )
}
