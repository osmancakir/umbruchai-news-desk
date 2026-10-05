import { interpolate } from 'remotion'
import type { BulletinManifest, BulletinStory } from '../../src/bulletin/manifest'

/** A card slides in just before the presenter starts a story and leaves just after she finishes. */
const CARD_LEAD_SEC = 0.3
const CARD_LINGER_SEC = 0.3

export interface StoryWindow {
  story: BulletinStory
  index: number
  from: number
  durationInFrames: number
}

/** The frames during which each story's news card is on screen. */
export function storyWindows(manifest: BulletinManifest, fps: number): StoryWindow[] {
  return manifest.segments
    .filter((segment) => segment.kind === 'story' && segment.story)
    .map((segment, index) => {
      const from = Math.max(0, Math.round((segment.startSec - CARD_LEAD_SEC) * fps))
      const to = Math.round((segment.endSec + CARD_LINGER_SEC) * fps)
      return { story: segment.story!, index, from, durationInFrames: to - from }
    })
}

/** Opacity of a black overlay that fades the video in from and out to black. */
export function blackFade(frame: number, fps: number, durationInFrames: number): number {
  return interpolate(frame, [0, fps * 0.6, durationInFrames - fps, durationInFrames - 1], [1, 0, 0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}
