import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { fetchBulletinArticles } from './articles.js'
import type { BulletinManifest, BulletinScript } from './manifest.js'
import { writeAnchorScript } from './script.js'
import { voiceScript } from './speech.js'

const TIME_ZONE = 'Europe/Berlin'
const PUBLIC_DIR = fileURLToPath(new URL('../../video/public/', import.meta.url))
const BULLETIN_DIR = 'bulletin'
const OUT_DIR = `${PUBLIC_DIR}${BULLETIN_DIR}/`
/** The bulletin aims for about two minutes; warn when the narration runs well past that. */
const MAX_DURATION_SEC = 135

const USAGE = `Usage: npm run bulletin -- [options]

Builds the anchor script and narration for the daily video bulletin into
video/public/bulletin/. Render it afterwards with \`npm run bulletin:render\`.

  --date YYYY-MM-DD   Edition date in Berlin time (default: today)
  --days N            Include articles from the last N days up to --date (default: 1)
  --limit N           Maximum number of stories (default: 5)
  --script-only       Stop after writing script.json so it can be reviewed and edited
  --voice-only        Skip the script step and voice the existing script.json
  -h, --help          Show this help`

function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date())
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The instant Berlin's clocks read 00:00 on `date`. */
function berlinMidnight(date: string): Date {
  const utcMidnight = new Date(`${date}T00:00:00Z`)
  const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(utcMidnight)
    .find((part) => part.type === 'timeZoneName')?.value
  const match = zoneName?.match(/GMT([+-])(\d{2}):(\d{2})/)
  const offsetMinutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0
  return new Date(utcMidnight.getTime() - offsetMinutes * 60_000)
}

function germanDateLabel(date: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

function positiveInt(value: string, flag: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive integer, got '${value}'`)
  return n
}

async function buildScript(date: string, days: number, limit: number): Promise<BulletinScript> {
  const from = berlinMidnight(addDays(date, 1 - days))
  const to = berlinMidnight(addDays(date, 1))
  console.log(`\n📰 Fetching articles from ${from.toISOString()} to ${to.toISOString()}...`)

  const articles = await fetchBulletinArticles(from, to, limit)
  if (!articles.length) {
    throw new Error(`No published German articles in that window. Try --days 3 or another --date.`)
  }
  for (const article of articles) console.log(`  • ${article.title} (${article.category})`)

  console.log(`\n✍️  Writing the anchor script...`)
  return writeAnchorScript(articles, date, germanDateLabel(date))
}

async function main() {
  const { values } = parseArgs({
    options: {
      date: { type: 'string' },
      days: { type: 'string', default: '1' },
      limit: { type: 'string', default: '5' },
      'script-only': { type: 'boolean', default: false },
      'voice-only': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) {
    console.log(USAGE)
    return
  }
  if (values['script-only'] && values['voice-only']) throw new Error('--script-only and --voice-only cannot be combined')

  const date = values.date ?? todayInBerlin()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date must be YYYY-MM-DD, got '${date}'`)

  await mkdir(OUT_DIR, { recursive: true })
  const scriptPath = `${OUT_DIR}script.json`

  let script: BulletinScript
  if (values['voice-only']) {
    script = JSON.parse(await readFile(scriptPath, 'utf8')) as BulletinScript
    console.log(`\n📄 Using existing script for ${script.dateLabel} (${script.segments.length} segments)`)
  } else {
    script = await buildScript(date, positiveInt(values.days, '--days'), positiveInt(values.limit, '--limit'))
    await writeFile(scriptPath, `${JSON.stringify(script, null, 2)}\n`)
    console.log(`  Script written to video/public/${BULLETIN_DIR}/script.json`)
  }

  if (values['script-only']) {
    console.log(`\nReview and edit the script, then run: npm run bulletin -- --voice-only`)
    return
  }

  console.log(`\n🎙️  Voicing the script...`)
  const { wav, segments, durationSec } = await voiceScript(script)
  await writeFile(`${OUT_DIR}bulletin.wav`, wav)

  const manifest: BulletinManifest = {
    date: script.date,
    dateLabel: script.dateLabel,
    audio: `${BULLETIN_DIR}/bulletin.wav`,
    presenterImage: 'presenter.png',
    presenterVideo: null,
    durationSec,
    segments,
  }
  await writeFile(`${OUT_DIR}bulletin.json`, `${JSON.stringify(manifest, null, 2)}\n`)

  const minutes = Math.floor(durationSec / 60)
  const seconds = Math.round(durationSec % 60)
  console.log(`\n✅ Bulletin ready: ${segments.length} segments, ${minutes}:${String(seconds).padStart(2, '0')} min`)
  if (durationSec > MAX_DURATION_SEC) {
    console.warn(`   ⚠️  Longer than ${Math.floor(MAX_DURATION_SEC / 60)}:${String(MAX_DURATION_SEC % 60).padStart(2, '0')} min. Shorten script.json and run: npm run bulletin -- --voice-only`)
  }
  console.log(`   Preview: npm run bulletin:preview`)
  console.log(`   Render:  npm run bulletin:render`)
}

main().catch((error) => {
  console.error(`\n❌ ${(error as Error).message}`)
  process.exit(1)
})
