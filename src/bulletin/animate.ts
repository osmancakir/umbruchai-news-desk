import 'dotenv/config'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { fal } from '@fal-ai/client'
import type { BulletinManifest } from './manifest.js'
import { trimWav } from './speech.js'

const PUBLIC_DIR = fileURLToPath(new URL('../../video/public/', import.meta.url))
const MANIFEST_PATH = `${PUBLIC_DIR}bulletin/bulletin.json`
// The presenter cropped to Flashtalk's portrait 448x768 output, at full height.
const PRESENTER_IMAGE = `${PUBLIC_DIR}presenter-portrait.png`
const DEFAULT_MODEL = 'fal-ai/flashtalk'

const USAGE = `Usage: npm run bulletin:animate -- [options]

Turns the presenter still and the bulletin narration into a lip-synced clip on fal,
then points the bulletin manifest at it. Run \`npm run bulletin\` first and
\`npm run bulletin:render\` afterwards.

  --seconds N    Only animate the first N seconds, as a cheap test. Writes
                 bulletin/presenter-preview.mp4 and leaves the manifest alone.
  --model ID     fal endpoint (default: ${DEFAULT_MODEL}); it must take image_url and audio_url
  -h, --help     Show this help`

interface AvatarOutput {
  video: { url: string }
  duration?: number
}

/** fal's published unit price for an endpoint, e.g. 0.02 USD per second. */
async function unitPrice(model: string, key: string): Promise<{ price: number; unit: string } | null> {
  try {
    const response = await fetch(`https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(model)}`, {
      headers: { Authorization: `Key ${key}` },
    })
    const body = (await response.json()) as { prices?: Array<{ unit_price: number; unit: string }> }
    const [entry] = body.prices ?? []
    return entry ? { price: entry.unit_price, unit: entry.unit } : null
  } catch {
    return null
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      seconds: { type: 'string' },
      model: { type: 'string', default: DEFAULT_MODEL },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) {
    console.log(USAGE)
    return
  }

  const key = process.env.FALAI_API_KEY ?? process.env.FAL_KEY
  if (!key) throw new Error('Set FALAI_API_KEY in .env')
  fal.config({ credentials: key })

  const seconds = values.seconds === undefined ? null : Number(values.seconds)
  if (seconds !== null && !(seconds > 0)) throw new Error(`--seconds must be a positive number, got '${values.seconds}'`)

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as BulletinManifest
  if (!manifest.audio) throw new Error('The bulletin has no narration. Run `npm run bulletin` first.')

  let wav: Buffer = await readFile(`${PUBLIC_DIR}${manifest.audio}`)
  if (seconds !== null) wav = trimWav(wav, seconds)

  const pricing = await unitPrice(values.model, key)
  const audioSec = seconds ?? manifest.durationSec
  if (pricing?.unit === 'seconds') {
    console.log(`\n💶 ${values.model}: $${pricing.price}/s → about $${(pricing.price * audioSec).toFixed(2)} for ${audioSec.toFixed(1)}s`)
  }

  console.log(`\n⬆️  Uploading presenter and narration to fal storage...`)
  const [imageUrl, audioUrl] = await Promise.all([
    fal.storage.upload(new Blob([await readFile(PRESENTER_IMAGE)], { type: 'image/png' })),
    fal.storage.upload(new Blob([new Uint8Array(wav)], { type: 'audio/wav' })),
  ])

  console.log(`\n🎬 Animating the presenter with ${values.model}...`)
  const startedAt = Date.now()
  let lastStatus = ''
  const result = await fal.subscribe(values.model, {
    input: { image_url: imageUrl, audio_url: audioUrl },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status !== lastStatus) {
        lastStatus = update.status
        console.log(`  ${update.status.toLowerCase().replace('_', ' ')}...`)
      }
    },
  })
  const output = result.data as AvatarOutput
  const elapsed = Math.round((Date.now() - startedAt) / 1000)

  const fileName = seconds === null ? 'presenter.mp4' : 'presenter-preview.mp4'
  const video = await fetch(output.video.url)
  if (!video.ok) throw new Error(`Downloading the clip failed: HTTP ${video.status}`)
  await writeFile(`${PUBLIC_DIR}bulletin/${fileName}`, Buffer.from(await video.arrayBuffer()))

  console.log(`\n✅ Clip saved to video/public/bulletin/${fileName} (${elapsed}s, request ${result.requestId})`)
  if (output.duration !== undefined && pricing?.unit === 'seconds') {
    console.log(`   Billed length ${output.duration.toFixed(1)}s → $${(pricing.price * output.duration).toFixed(2)}`)
  }

  if (seconds === null) {
    manifest.presenterVideo = `bulletin/${fileName}`
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`   Manifest updated. Render with: npm run bulletin:render`)
  }
}

main().catch((error) => {
  // fal's ApiError carries the useful part (e.g. "Exhausted balance") in its body.
  const detail = (error as { body?: { detail?: unknown } }).body?.detail
  console.error(`\n❌ ${(error as Error).message}${detail ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`)
  process.exit(1)
})
