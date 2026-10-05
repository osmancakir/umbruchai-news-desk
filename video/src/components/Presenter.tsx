import { AbsoluteFill, Img, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

/**
 * The presenter layer, cover-fitted to the frame. A lip-synced clip replaces the
 * still once one exists; until then the still gets a slow push-in so the frame
 * never sits dead.
 */
export const Presenter = ({
  image,
  video,
  objectPosition = 'center',
}: {
  image: string
  video: string | null
  objectPosition?: string
}) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const fill = { width: '100%', height: '100%', objectFit: 'cover', objectPosition } as const

  if (video) {
    return (
      <AbsoluteFill>
        <OffthreadVideo src={staticFile(video)} muted style={fill} />
      </AbsoluteFill>
    )
  }

  const scale = interpolate(frame, [0, durationInFrames], [1, 1.06])
  return (
    <AbsoluteFill>
      <Img src={staticFile(image)} style={{ ...fill, transform: `scale(${scale})`, transformOrigin: '50% 35%' }} />
    </AbsoluteFill>
  )
}
