import { assertValidArticle, normalizeArticlePayload } from '../articleValidation.js'

const ARTICLE_LEVELS = ['easy', 'medium', 'advanced'] as const
type Level = (typeof ARTICLE_LEVELS)[number]

const DEFAULT_PROJECT_ID = 'nws8g1b1'
const DEFAULT_DATASET = 'production'
const DEFAULT_API_VERSION = '2025-02-19'
const DEFAULT_TTS_MODEL = 'tts-1'
const DEFAULT_TTS_VOICE = 'alloy'
const DEFAULT_TTS_SPEED = 1
const DEFAULT_MAX_TTS_CHARS = 3800
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

interface FetchOptions {
  label: string
  attempts?: number
  timeoutSeconds?: number
  binary?: boolean
}

interface TtsOptions {
  apiKey: string
  model: string
  voice: string
  speed: number
  maxChars: number
  attempts: number
  timeoutSeconds: number
}

interface SanityOptions {
  token: string
  projectId: string
  dataset: string
  apiVersion: string
  attempts: number
  timeoutSeconds: number
}

interface PortableTextBlock {
  _type: string
  children?: Array<{ _type: string; text?: string }>
  listItem?: string
}

interface ArticleDoc {
  _type: string
  slug?: { current?: string }
  levels?: Record<string, { content?: PortableTextBlock[]; audio?: unknown }>
  [key: string]: unknown
}

interface MutationPayload {
  mutations: Array<{ createOrReplace?: ArticleDoc; create?: ArticleDoc }>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffDelayMs(attempt: number, baseMs = 1000, maxMs = 8000): number {
  return Math.min(maxMs, baseMs * 2 ** (attempt - 1))
}

function shouldRetryError(error: unknown): boolean {
  const err = error as { name?: string; code?: string; message?: string }
  const message = String(err?.message ?? error).toLowerCase()
  return (
    err?.name === 'AbortError' ||
    err?.code === 'ECONNRESET' ||
    err?.code === 'ETIMEDOUT' ||
    err?.code === 'EAI_AGAIN' ||
    message.includes('timed out') ||
    message.includes('connection reset') ||
    message.includes('fetch failed')
  )
}

async function fetchWithRetries(
  url: string,
  options: RequestInit,
  { label, attempts = 4, timeoutSeconds = 120, binary = false }: FetchOptions,
): Promise<Buffer | Record<string, unknown>> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000)

    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)

      if (response.ok) {
        if (binary) return Buffer.from(await response.arrayBuffer())
        const text = await response.text()
        return text ? (JSON.parse(text) as Record<string, unknown>) : {}
      }

      const body = await response.text()
      if (RETRYABLE_HTTP_STATUS.has(response.status) && attempt < attempts) {
        const waitMs = backoffDelayMs(attempt)
        console.log(`${label} got HTTP ${response.status}; retrying in ${(waitMs / 1000).toFixed(1)}s (${attempt}/${attempts})`)
        await sleep(waitMs)
        continue
      }
      throw new Error(`${label} failed: HTTP ${response.status} ${body}`)
    } catch (error) {
      clearTimeout(timeout)
      if (attempt < attempts && shouldRetryError(error)) {
        const waitMs = backoffDelayMs(attempt)
        console.log(`${label} network error (${(error as Error).message}); retrying in ${(waitMs / 1000).toFixed(1)}s (${attempt}/${attempts})`)
        await sleep(waitMs)
        continue
      }
      throw error
    }
  }

  throw new Error(`${label} failed after ${attempts} attempts`)
}

function sanityBlocksToText(blocks: PortableTextBlock[]): string {
  return blocks
    .filter((b) => b?._type === 'block')
    .map((b) => {
      const text = (b.children ?? [])
        .filter((c) => c._type === 'span')
        .map((c) => c.text ?? '')
        .join('')
        .trim()
      if (!text) return null
      return b.listItem ? `- ${text}` : text
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function textByLevel(doc: ArticleDoc): Record<Level, string> {
  const levels = (doc.levels ?? {}) as Record<string, { content?: PortableTextBlock[] }>
  const result = {} as Record<Level, string>

  for (const level of ARTICLE_LEVELS) {
    const text = sanityBlocksToText(levels[level]?.content ?? [])
    if (!text) throw new Error(`No speakable content found for level '${level}'`)
    result[level] = text
  }

  return result
}

function splitLongSegment(segment: string, maxChars: number): string[] {
  if (segment.length <= maxChars) return [segment]

  const sentences = segment
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (sentences.length <= 1) {
    const chunks: string[] = []
    for (let i = 0; i < segment.length; i += maxChars) {
      chunks.push(segment.slice(i, i + maxChars).trim())
    }
    return chunks.filter(Boolean)
  }

  return packSegments(sentences, maxChars, ' ')
}

function packSegments(segments: string[], maxChars: number, separator: string): string[] {
  const chunks: string[] = []
  let current = ''

  for (const raw of segments) {
    const segment = raw.trim()
    if (!segment) continue

    if (segment.length > maxChars) {
      if (current) { chunks.push(current); current = '' }
      chunks.push(...splitLongSegment(segment, maxChars))
      continue
    }

    const next = current ? `${current}${separator}${segment}` : segment
    if (next.length <= maxChars) {
      current = next
    } else {
      if (current) chunks.push(current)
      current = segment
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function chunkTextForTts(text: string, maxChars: number): string[] {
  const normalized = text.trim()
  if (!normalized) throw new Error('Cannot generate TTS from empty text')
  if (normalized.length <= maxChars) return [normalized]

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return packSegments(paragraphs, maxChars, '\n\n')
}

async function generateSpeechBuffer(text: string, label: string, options: TtsOptions): Promise<Buffer> {
  const chunks = chunkTextForTts(text, options.maxChars)
  if (chunks.length > 1) {
    console.log(`  Splitting ${label} into ${chunks.length} TTS requests`)
  }

  const buffers: Buffer[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunkLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''
    console.log(`  Generating ${label}${chunkLabel}...`)

    const buf = await fetchWithRetries(
      'https://api.openai.com/v1/audio/speech',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          voice: options.voice,
          input: chunks[i],
          response_format: 'mp3',
          speed: options.speed,
        }),
      },
      { label: 'OpenAI TTS', attempts: options.attempts, timeoutSeconds: options.timeoutSeconds, binary: true },
    ) as Buffer
    buffers.push(buf)
  }

  return Buffer.concat(buffers)
}

async function uploadAudioAsset(buffer: Buffer, fileName: string, options: SanityOptions): Promise<string> {
  const uploadUrl = `https://${options.projectId}.api.sanity.io/${options.apiVersion}/assets/files/${options.dataset}?filename=${encodeURIComponent(fileName)}`

  const payload = await fetchWithRetries(
    uploadUrl,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'audio/mpeg' },
      body: buffer as unknown as BodyInit,
    },
    { label: `Upload ${fileName}`, attempts: options.attempts, timeoutSeconds: options.timeoutSeconds },
  ) as Record<string, unknown>

  const assetId =
    (payload?.document as Record<string, unknown>)?._id ??
    payload?._id ??
    (payload?.asset as Record<string, unknown>)?._id

  if (!assetId) throw new Error(`Asset upload returned no asset id for ${fileName}`)
  return assetId as string
}

async function uploadImageAsset(buffer: Buffer, fileName: string, mimeType: string, options: SanityOptions): Promise<string> {
  const uploadUrl = `https://${options.projectId}.api.sanity.io/${options.apiVersion}/assets/images/${options.dataset}?filename=${encodeURIComponent(fileName)}`

  const payload = await fetchWithRetries(
    uploadUrl,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': mimeType },
      body: buffer as unknown as BodyInit,
    },
    { label: `Upload image ${fileName}`, attempts: options.attempts, timeoutSeconds: options.timeoutSeconds },
  ) as Record<string, unknown>

  const assetId =
    (payload?.document as Record<string, unknown>)?._id ??
    payload?._id

  if (!assetId) throw new Error(`Image upload returned no asset id for ${fileName}`)
  return assetId as string
}

export async function uploadBase64ImageToSanity(dataUrl: string): Promise<string> {
  const sanityToken = process.env.SANITY_API_TOKEN ?? ''
  if (!sanityToken) throw new Error('Missing Sanity token: set SANITY_API_TOKEN')

  const apiVersion = String(process.env.SANITY_API_VERSION ?? DEFAULT_API_VERSION).trim()
  const options: SanityOptions = {
    token: sanityToken,
    projectId: process.env.SANITY_PROJECT_ID ?? DEFAULT_PROJECT_ID,
    dataset: process.env.SANITY_DATASET ?? DEFAULT_DATASET,
    apiVersion: apiVersion.startsWith('v') ? apiVersion : `v${apiVersion}`,
    attempts: 4,
    timeoutSeconds: 60,
  }

  // Strip the data URI prefix: "data:image/png;base64,..."
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) throw new Error('uploadBase64ImageToSanity: not a valid data URL')
  const [, mimeType, b64] = match
  const buffer = Buffer.from(b64, 'base64')
  const ext = mimeType.split('/')[1] ?? 'png'
  const fileName = `article-illustration-${Date.now()}.${ext}`

  console.log(`  Uploading image to Sanity (${Math.round(buffer.length / 1024)} KB)...`)
  const assetId = await uploadImageAsset(buffer, fileName, mimeType, options)
  console.log(`  Sanity image asset: ${assetId}`)
  return assetId
}

function attachAudioRef(doc: ArticleDoc, level: Level, assetId: string): void {
  if (!doc.levels) doc.levels = {}
  if (!doc.levels[level]) doc.levels[level] = {}

  doc.levels[level].audio = {
    _type: 'file',
    asset: { _type: 'reference', _ref: assetId },
  }
}

async function postMutations(payload: MutationPayload, options: SanityOptions): Promise<Record<string, unknown>> {
  const mutateUrl = `https://${options.projectId}.api.sanity.io/${options.apiVersion}/data/mutate/${options.dataset}?autoGenerateArrayKeys=true&returnIds=true&visibility=sync`

  return fetchWithRetries(
    mutateUrl,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { label: 'Sanity mutation', attempts: options.attempts, timeoutSeconds: options.timeoutSeconds },
  ) as Promise<Record<string, unknown>>
}

export async function postArticleWithAudio(rawData: unknown): Promise<string> {
  const normalized = normalizeArticlePayload(rawData)
  const payload = normalized.payload as MutationPayload
  const doc = normalized.doc as ArticleDoc
  assertValidArticle(payload)

  const slug = typeof doc.slug?.current === 'string' ? doc.slug.current.trim() : ''
  if (!slug) throw new Error('Could not read slug.current from article data')

  const levelText = textByLevel(doc)
  console.log(`  Slug: ${slug}`)
  for (const level of ARTICLE_LEVELS) {
    console.log(`  ${level}: ${levelText[level].length} chars`)
  }

  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey) throw new Error('OPENAI_API_KEY is missing from environment')

  const ttsOptions: TtsOptions = {
    apiKey: openaiApiKey,
    model: process.env.OPENAI_TTS_MODEL ?? DEFAULT_TTS_MODEL,
    voice: process.env.OPENAI_TTS_VOICE ?? DEFAULT_TTS_VOICE,
    speed: Number(process.env.OPENAI_TTS_SPEED) || DEFAULT_TTS_SPEED,
    maxChars: DEFAULT_MAX_TTS_CHARS,
    attempts: 4,
    timeoutSeconds: 120,
  }

  console.log(`  Model: ${ttsOptions.model} | Voice: ${ttsOptions.voice} | Speed: ${ttsOptions.speed}`)

  const sanityToken = process.env.SANITY_API_TOKEN ?? ''
  if (!sanityToken) throw new Error('Missing Sanity token: set SANITY_API_TOKEN')

  const apiVersion = String(process.env.SANITY_API_VERSION ?? DEFAULT_API_VERSION).trim()

  const sanityOptions: SanityOptions = {
    token: sanityToken,
    projectId: process.env.SANITY_PROJECT_ID ?? DEFAULT_PROJECT_ID,
    dataset: process.env.SANITY_DATASET ?? DEFAULT_DATASET,
    apiVersion: apiVersion.startsWith('v') ? apiVersion : `v${apiVersion}`,
    attempts: 5,
    timeoutSeconds: 120,
  }

  for (const level of ARTICLE_LEVELS) {
    const fileName = `${slug}_${level}.mp3`
    const buffer = await generateSpeechBuffer(levelText[level], fileName, ttsOptions)
    console.log(`  Uploading ${fileName}...`)
    const assetId = await uploadAudioAsset(buffer, fileName, sanityOptions)
    attachAudioRef(doc, level, assetId)
  }

  console.log('  Posting mutations to Sanity...')
  const result = await postMutations(payload, { ...sanityOptions, attempts: 4 })
  const resultCount = Array.isArray(result?.results) ? (result.results as unknown[]).length : 0
  const summary = `Mutation posted. transactionId=${result?.transactionId ?? 'n/a'}, results=${resultCount}`
  console.log(`  ${summary}`)

  return summary
}
