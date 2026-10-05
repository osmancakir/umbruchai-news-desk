// Plain types with no imports, so the Remotion project (video/) can import them too.

export type SegmentKind = 'intro' | 'story' | 'outro'

/** What the news card in the top-right corner shows while a story is read. */
export interface BulletinStory {
  slug: string
  category: string
  title: string
  subtitle: string
  imageUrl: string | null
  journalist: string | null
}

/** One spoken block of the anchor script, before it is voiced. */
export interface ScriptSegment {
  kind: SegmentKind
  text: string
  story?: BulletinStory
}

/**
 * The editable anchor script (video/public/bulletin/script.json). Edit the
 * texts and rerun `npm run bulletin -- --voice-only` to re-voice it.
 */
export interface BulletinScript {
  date: string
  dateLabel: string
  segments: ScriptSegment[]
}

export interface TimedSegment extends ScriptSegment {
  startSec: number
  endSec: number
}

/** Everything the Remotion composition needs to render one bulletin. */
export interface BulletinManifest {
  date: string
  dateLabel: string
  /** Paths are relative to video/public. */
  audio: string | null
  presenterImage: string
  /** A portrait lip-synced presenter clip. The reel uses it; the 16:9 cut keeps the still. */
  presenterVideo: string | null
  durationSec: number
  segments: TimedSegment[]
}
