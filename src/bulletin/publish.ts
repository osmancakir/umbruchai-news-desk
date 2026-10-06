import 'dotenv/config'
import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { fetchWithRetries, sanityOptionsFromEnv, type SanityOptions } from '../tools/postArticle.js'
import type { BulletinManifest } from './manifest.js'

const VIDEO_DIR = fileURLToPath(new URL('../../video/', import.meta.url))
const MANIFEST_PATH = `${VIDEO_DIR}public/bulletin/bulletin.json`
const DEFAULT_INPUT = `${VIDEO_DIR}out/bulletin-reel.mp4`
/** Where the presenter is mid-sentence and the first card is up, for the poster. */
const POSTER_AT_SEC = 3

const USAGE = `Usage: npm run bulletin:publish -- [options]

Uploads the rendered reel to Sanity as the \`bulletin-<date>\` document the
homepage plays. Run it after \`npm run bulletin:render\`. Republishing a date
replaces that day's document.

  --file PATH         Rendered reel to upload (default: video/out/bulletin-reel.mp4)
  --no-transcode      Upload the render as-is instead of a 720p web copy
  -h, --help          Show this help`

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => reject(new Error(`${command} could not start (${error.message}). Is it installed?`)))
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}:\n${stderr.slice(-2000)}`)))
  })
}

/**
 * The render is a 1080p master at ~7.5 Mbit/s, which is ~100 MB for two
 * minutes. The homepage plays it in a phone-sized frame, so a 720p copy at a
 * fraction of the size looks the same there. `+faststart` keeps it streamable.
 */
async function transcodeForWeb(input: string, output: string): Promise<void> {
  await run('ffmpeg', [
    '-y', '-i', input,
    '-vf', 'scale=720:-2',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    output,
  ])
}

async function extractPoster(input: string, output: string): Promise<void> {
  await run('ffmpeg', ['-y', '-ss', String(POSTER_AT_SEC), '-i', input, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', output])
}

async function uploadAsset(
  kind: 'files' | 'images',
  path: string,
  mimeType: string,
  fileName: string,
  options: SanityOptions,
): Promise<string> {
  const url = `https://${options.projectId}.api.sanity.io/${options.apiVersion}/assets/${kind}/${options.dataset}?filename=${encodeURIComponent(fileName)}`
  const payload = await fetchWithRetries(
    url,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': mimeType },
      body: (await readFile(path)) as unknown as BodyInit,
    },
    { label: `Upload ${fileName}`, attempts: options.attempts, timeoutSeconds: options.timeoutSeconds },
  ) as { document?: { _id?: string } }

  const assetId = payload.document?._id
  if (!assetId) throw new Error(`Upload of ${fileName} returned no asset id`)
  return assetId
}

/** Resolves the slugs the script read to the published German articles' ids, keeping script order. */
async function articleIdsBySlug(slugs: string[], options: SanityOptions): Promise<string[]> {
  if (!slugs.length) return []
  const params = new URLSearchParams({
    query: `*[_type == "article" && language == "german" && slug.current in $slugs]{ _id, "slug": slug.current }`,
    $slugs: JSON.stringify(slugs),
    perspective: 'published',
  })
  const url = `https://${options.projectId}.api.sanity.io/${options.apiVersion}/data/query/${options.dataset}?${params}`
  const payload = await fetchWithRetries(
    url,
    { headers: { Authorization: `Bearer ${options.token}` } },
    { label: 'Sanity query', attempts: options.attempts, timeoutSeconds: 60 },
  ) as { result?: Array<{ _id: string; slug: string }> }

  const idBySlug = new Map((payload.result ?? []).map((row) => [row.slug, row._id]))
  const missing = slugs.filter((slug) => !idBySlug.has(slug))
  if (missing.length) console.warn(`   ⚠️  No published article for: ${missing.join(', ')}`)
  return slugs.flatMap((slug) => idBySlug.get(slug) ?? [])
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', default: DEFAULT_INPUT },
      'no-transcode': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) {
    console.log(USAGE)
    return
  }

  const input = values.file
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as BulletinManifest
  const inputStat = await stat(input).catch(() => null)
  if (!inputStat) throw new Error(`No render at ${input}. Run: npm run bulletin:render`)
  if (inputStat.mtimeMs < (await stat(MANIFEST_PATH)).mtimeMs) {
    console.warn(`   ⚠️  The render is older than bulletin.json — it may not be ${manifest.date}'s edition.`)
  }

  console.log(`\n🎬 Publishing the bulletin for ${manifest.dateLabel}`)

  const base = input.replace(/\.mp4$/, '')
  let video = input
  if (!values['no-transcode']) {
    video = `${base}.web.mp4`
    console.log(`  Transcoding a 720p web copy...`)
    await transcodeForWeb(input, video)
  }
  const poster = `${base}.poster.jpg`
  await extractPoster(video, poster)
  console.log(`  Video: ${megabytes((await stat(video)).size)} (render was ${megabytes(inputStat.size)})`)

  const options = sanityOptionsFromEnv(4, 600)
  console.log(`  Uploading to Sanity...`)
  const [videoAssetId, posterAssetId, storyIds] = await Promise.all([
    uploadAsset('files', video, 'video/mp4', `bulletin-${manifest.date}.mp4`, options),
    uploadAsset('images', poster, 'image/jpeg', `bulletin-${manifest.date}.jpg`, options),
    articleIdsBySlug(
      manifest.segments.flatMap((segment) => segment.story?.slug ?? []),
      options,
    ),
  ])

  const doc = {
    _id: `bulletin-${manifest.date}`,
    _type: 'bulletin',
    date: manifest.date,
    dateLabel: manifest.dateLabel,
    durationSec: manifest.durationSec,
    video: { _type: 'file', asset: { _type: 'reference', _ref: videoAssetId } },
    poster: { _type: 'image', asset: { _type: 'reference', _ref: posterAssetId } },
    stories: storyIds.map((id) => ({ _type: 'reference', _ref: id, _key: id.slice(-12) })),
    transcript: manifest.segments.map((segment) => segment.text).join('\n\n'),
  }

  await fetchWithRetries(
    `https://${options.projectId}.api.sanity.io/${options.apiVersion}/data/mutate/${options.dataset}?returnIds=true&visibility=sync`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutations: [{ createOrReplace: doc }] }),
    },
    { label: 'Sanity mutation', attempts: options.attempts, timeoutSeconds: 60 },
  )

  console.log(`\n✅ Published ${doc._id} with ${storyIds.length} linked stories. It shows on the homepage within ~5 minutes.`)
}

main().catch((error) => {
  console.error(`\n❌ ${(error as Error).message}`)
  process.exit(1)
})
