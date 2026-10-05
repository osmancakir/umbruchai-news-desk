import type { CSSProperties } from 'react'
import { AbsoluteFill, Html5Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import type { BulletinProps } from './Bulletin'
import { AiDisclosure } from './components/AiDisclosure'
import { LowerThird } from './components/LowerThird'
import { Presenter } from './components/Presenter'
import { ReelCard } from './components/ReelCard'
import { COLORS, FONT_SANS, REEL_SAFE } from './theme'
import { blackFade, storyWindows } from './timing'

/** Height of the news panel that drops in over the top of the frame. */
const PANEL_HEIGHT = 860
/** How far the presenter is pushed down while the panel is in; keeps her face just below it. */
const PRESENTER_PUSH = 440
const SPLIT_SEC = 0.9
/** Gap between the panel's bottom edge and the tags riding on the presenter below it. */
const TAG_GAP = 28

/**
 * The 9:16 cut for Instagram Reels. The presenter opens full screen; when the
 * first story starts she is pushed down and the news panel drops in on top,
 * and she comes back full screen for the sign-off.
 */
export const Reel = ({ manifest }: BulletinProps) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  if (!manifest) return null

  const windows = storyWindows(manifest, fps)
  const splitFrames = Math.round(fps * SPLIT_SEC)
  const splitFrom = windows[0]?.from ?? durationInFrames
  const lastWindow = windows[windows.length - 1]
  const splitTo = lastWindow ? lastWindow.from + lastWindow.durationInFrames : durationInFrames

  const split =
    spring({ frame: frame - splitFrom, fps, config: { damping: 200 }, durationInFrames: splitFrames }) -
    spring({ frame: frame - splitTo, fps, config: { damping: 200 }, durationInFrames: splitFrames })
  const panelOffset = (split - 1) * (PANEL_HEIGHT + 60)
  // The tags sit on the presenter: at the top while she is full screen, pushed down by the panel's edge after.
  const tagTop = Math.max(REEL_SAFE.top, PANEL_HEIGHT + panelOffset + TAG_GAP)

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', fontFamily: FONT_SANS }}>
      <AbsoluteFill style={{ transform: `translateY(${split * PRESENTER_PUSH}px)` }}>
        <Presenter image={manifest.presenterImage} video={manifest.presenterVideo} />
      </AbsoluteFill>
      {manifest.audio && <Html5Audio src={staticFile(manifest.audio)} />}

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: PANEL_HEIGHT,
          overflow: 'hidden',
          backgroundColor: COLORS.paper,
          boxShadow: `0 18px 48px ${COLORS.shadow}`,
          transform: `translateY(${panelOffset}px)`,
        }}
      >
        {windows.map(({ story, index, from, durationInFrames: duration }) => {
          const isLast = index === windows.length - 1
          return (
            <Sequence
              key={story.slug}
              from={from}
              // The last card rides out with the panel instead of sliding away first.
              durationInFrames={isLast ? duration + splitFrames : duration}
              premountFor={fps}
            >
              <ReelCard story={story} index={index} total={windows.length} enters={index > 0} exitsAt={isLast ? null : duration} />
            </Sequence>
          )
        })}
      </div>

      {/* Brand and date while she is full screen; a compact brand tag while the panel is in. */}
      <LowerThird dateLabel={manifest.dateLabel} scale={1.35} style={{ left: REEL_SAFE.x, bottom: 600, opacity: 1 - split }} />
      <BrandTag style={{ top: tagTop, opacity: interpolate(split, [0.85, 1], [0, 1], { extrapolateLeft: 'clamp' }) }} />
      <AiDisclosure style={{ top: tagTop, right: REEL_SAFE.x }} fontSize={24} />

      <AbsoluteFill style={{ backgroundColor: '#000', opacity: blackFade(frame, fps, durationInFrames) }} />
    </AbsoluteFill>
  )
}

const BrandTag = ({ style }: { style: CSSProperties }) => (
  <div
    style={{
      position: 'absolute',
      left: REEL_SAFE.x,
      padding: '8px 18px',
      borderRadius: 6,
      backgroundColor: COLORS.brand,
      color: COLORS.paper,
      fontSize: 26,
      fontWeight: 800,
      letterSpacing: 1,
      ...style,
    }}
  >
    UMBRUCH AI
  </div>
)
