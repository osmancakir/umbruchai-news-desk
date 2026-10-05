import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import type { BulletinManifest } from '../../src/bulletin/manifest'
import { AiDisclosure } from './components/AiDisclosure'
import { LowerThird } from './components/LowerThird'
import { NewsCard } from './components/NewsCard'
import { Presenter } from './components/Presenter'
import { FONT_SANS } from './theme'
import { blackFade, storyWindows } from './timing'

export type BulletinProps = {
  manifest: BulletinManifest | null
}

/** The 16:9 cut for YouTube: full-frame presenter, news card in the top-right corner. */
export const Bulletin = ({ manifest }: BulletinProps) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  if (!manifest) return null

  const windows = storyWindows(manifest, fps)

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', fontFamily: FONT_SANS }}>
      {/* The lip-synced clip is portrait (it is made for the reel), so this cut keeps the still. */}
      <Presenter image={manifest.presenterImage} video={null} objectPosition="50% 42%" />
      {manifest.audio && <Html5Audio src={staticFile(manifest.audio)} />}

      {windows.map(({ story, index, from, durationInFrames: duration }) => (
        <Sequence key={story.slug} from={from} durationInFrames={duration} premountFor={fps}>
          <NewsCard story={story} index={index} total={windows.length} />
        </Sequence>
      ))}

      <LowerThird dateLabel={manifest.dateLabel} />
      <AiDisclosure style={{ top: 48, left: 56 }} />
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: blackFade(frame, fps, durationInFrames) }} />
    </AbsoluteFill>
  )
}
