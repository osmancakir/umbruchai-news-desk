import { Composition, staticFile, type CalculateMetadataFunction } from 'remotion'
import { Bulletin, type BulletinProps } from './Bulletin'
import { Reel } from './Reel'
import type { BulletinManifest } from '../../src/bulletin/manifest'

const FPS = 30
const MANIFEST_PATH = 'bulletin/bulletin.json'

/** Loads the manifest written by `npm run bulletin` and sizes the video to its narration. */
const loadManifest: CalculateMetadataFunction<BulletinProps> = async ({ props, abortSignal }) => {
  const response = await fetch(staticFile(MANIFEST_PATH), { signal: abortSignal })
  if (!response.ok) {
    throw new Error(`No bulletin found at public/${MANIFEST_PATH}. Run \`npm run bulletin\` in the repo root first.`)
  }
  const manifest = (await response.json()) as BulletinManifest
  return {
    durationInFrames: Math.ceil(manifest.durationSec * FPS),
    props: { ...props, manifest },
  }
}

export const RemotionRoot = () => (
  <>
    <Composition
      id="Reel"
      component={Reel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS}
      defaultProps={{ manifest: null }}
      calculateMetadata={loadManifest}
    />
    <Composition
      id="Bulletin"
      component={Bulletin}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={FPS}
      defaultProps={{ manifest: null }}
      calculateMetadata={loadManifest}
    />
  </>
)
