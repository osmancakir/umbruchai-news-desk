import { fetchWithRetries } from '../tools/postArticle.js'
import type { BulletinScript, TimedSegment } from './manifest.js'

// OpenAI's `pcm` format: 24 kHz, 16-bit signed little-endian, mono.
const SAMPLE_RATE = 24_000
const BYTES_PER_SECOND = SAMPLE_RATE * 2

const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts-2025-12-15'
const DEFAULT_VOICE = 'marin'
const MAX_SEGMENT_CHARS = 4000
const CONCURRENCY = 4

/** Silence before the intro, between segments, and after the outro. */
const LEAD_IN_SEC = 1.2
const GAP_SEC = 0.6
const TAIL_SEC = 1.8

const ANCHOR_INSTRUCTIONS = `Voice: a warm, confident female TV news anchor reading the evening news in clear standard German (Hochdeutsch).
Tone: calm, trustworthy and friendly; neutral on political topics.
Pacing: a steady broadcast pace with short natural pauses between sentences; never rushed.`

async function synthesizePcm(text: string, apiKey: string, model: string, voice: string): Promise<Buffer> {
  if (text.length > MAX_SEGMENT_CHARS) throw new Error(`Script segment is too long for one TTS request (${text.length} chars)`)

  return fetchWithRetries(
    'https://api.openai.com/v1/audio/speech',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, voice, input: text, response_format: 'pcm', instructions: ANCHOR_INSTRUCTIONS }),
    },
    { label: 'OpenAI TTS', attempts: 4, timeoutSeconds: 120, binary: true },
  ) as Promise<Buffer>
}

function silence(seconds: number): Buffer {
  // Keep the byte count on a sample boundary.
  return Buffer.alloc(Math.round(seconds * SAMPLE_RATE) * 2)
}

function wavHeader(dataBytes: number): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(BYTES_PER_SECOND, 28)
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(dataBytes, 40)
  return header
}

/** The first `seconds` of a WAV written by voiceScript, for cheap test runs. */
export function trimWav(wav: Buffer, seconds: number): Buffer {
  const pcm = wav.subarray(44)
  const bytes = Math.min(pcm.length, Math.round(seconds * SAMPLE_RATE) * 2)
  return Buffer.concat([wavHeader(bytes), pcm.subarray(0, bytes)])
}

/**
 * Voices every script segment and joins them into one WAV track. Each segment's
 * start and end time comes straight from its PCM byte length, which is what the
 * news cards are timed against.
 */
export async function voiceScript(script: BulletinScript): Promise<{ wav: Buffer; segments: TimedSegment[]; durationSec: number }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing from environment')
  const model = process.env.OPENAI_TTS_MODEL ?? DEFAULT_TTS_MODEL
  const voice = process.env.BULLETIN_TTS_VOICE ?? DEFAULT_VOICE
  console.log(`  Model: ${model} | Voice: ${voice}`)

  const clips: Buffer[] = new Array(script.segments.length)
  let next = 0
  const worker = async () => {
    while (next < script.segments.length) {
      const index = next++
      const segment = script.segments[index]
      console.log(`  Voicing ${index + 1}/${script.segments.length} (${segment.kind}${segment.story ? `: ${segment.story.slug}` : ''})`)
      const pcm = await synthesizePcm(segment.text, apiKey, model, voice)
      // Drop a dangling byte so every later segment stays sample-aligned.
      clips[index] = pcm.length % 2 ? pcm.subarray(0, pcm.length - 1) : pcm
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, script.segments.length) }, worker))

  const parts: Buffer[] = [silence(LEAD_IN_SEC)]
  let cursorBytes = parts[0].length
  const segments: TimedSegment[] = script.segments.map((segment, index) => {
    if (index > 0) {
      const gap = silence(GAP_SEC)
      parts.push(gap)
      cursorBytes += gap.length
    }
    const startSec = cursorBytes / BYTES_PER_SECOND
    parts.push(clips[index])
    cursorBytes += clips[index].length
    return { ...segment, startSec, endSec: cursorBytes / BYTES_PER_SECOND }
  })
  parts.push(silence(TAIL_SEC))

  const pcm = Buffer.concat(parts)
  return {
    wav: Buffer.concat([wavHeader(pcm.length), pcm]),
    segments,
    durationSec: pcm.length / BYTES_PER_SECOND,
  }
}
