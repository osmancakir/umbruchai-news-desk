#!/usr/bin/env node

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ARTICLE_LEVELS = ['easy', 'medium', 'advanced']
const DEFAULT_PROJECT_ID = 'nws8g1b1'
const DEFAULT_DATASET = 'production'
const DEFAULT_API_VERSION = '2025-02-19'
const DEFAULT_TTS_MODEL = 'tts-1'
const DEFAULT_TTS_VOICE = 'alloy'
const DEFAULT_TTS_SPEED = 1
const DEFAULT_MAX_TTS_CHARS = 3800
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const BOOLEAN_FLAGS = new Set([
  '--help',
  '--post',
  '--upload',
  '--dry-run',
  '--skip-tts',
  '--no-env',
  '--strict',
])
const MIME_BY_EXT = new Map([
  ['.aac', 'audio/aac'],
  ['.flac', 'audio/flac'],
  ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.webm', 'audio/webm'],
])

function printUsage() {
  console.log(`
Generate per-level TTS audio for an Umbruch AI article, attach Sanity file refs, and optionally post it.

Usage:
  node scripts/post_article_with_audio.mjs --article <mutation-json> [options]
  node scripts/post_article_with_audio.mjs <mutation-json> --post

Core options:
  --article <path>           Article mutation JSON file. Also accepts --article-file or --news-file.
  --audio-dir <path>         Directory for <slug>_<level>.mp3 files (default: news/audios).
  --out <path>               Enriched mutation output path (default: <input>.with-audio.json).
  --dry-run                  Parse and validate only. Does not call OpenAI or Sanity.
  --skip-tts                 Reuse existing audio files instead of calling OpenAI TTS.
  --upload                   Upload audio assets and write audio refs, but do not post the mutation.
  --post                     Upload audio assets, write audio refs, and post the mutation to Sanity.

OpenAI options:
  --openai-api-key <token>   Defaults to OPENAI_API_KEY from .env or environment.
  --tts-model <model>        Default: ${DEFAULT_TTS_MODEL}
  --voice <voice>            Default: ${DEFAULT_TTS_VOICE}
  --speed <number>           Default: ${DEFAULT_TTS_SPEED}
  --max-tts-chars <number>   Chunk long text before TTS (default: ${DEFAULT_MAX_TTS_CHARS}).

Sanity options:
  --project-id <id>          Default: SANITY_PROJECT_ID or ${DEFAULT_PROJECT_ID}
  --dataset <name>           Default: SANITY_DATASET or ${DEFAULT_DATASET}
  --api-version <date>       Default: SANITY_API_VERSION or ${DEFAULT_API_VERSION}
  --token <token>            Sanity write token. Default: SANITY_API_TOKEN.
  --strict                   Fail if any level has missing audio when --skip-tts is used.
  --help                     Show this message.
`)
}

function fail(message) {
  throw new Error(message)
}

function parseArgs(argv) {
  const args = { positional: [] }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (!arg.startsWith('--')) {
      args.positional.push(arg)
      continue
    }

    const eqIndex = arg.indexOf('=')
    if (eqIndex > -1) {
      const key = arg.slice(0, eqIndex)
      const value = arg.slice(eqIndex + 1)
      args[key] = value
      continue
    }

    if (BOOLEAN_FLAGS.has(arg)) {
      args[arg] = true
      continue
    }

    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      fail(`Missing value for ${arg}`)
    }

    args[arg] = next
    i += 1
  }

  return args
}

function parseNumber(rawValue, fallback, label) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return fallback
  const value = Number(rawValue)
  if (!Number.isFinite(value)) fail(`${label} must be a number`)
  return value
}

function normalizeApiVersion(apiVersion) {
  const value = String(apiVersion || DEFAULT_API_VERSION).trim()
  return value.startsWith('v') ? value : `v${value}`
}

function resolvePath(rawPath, fallback) {
  const value = rawPath || fallback
  if (!value) return null
  return path.resolve(process.cwd(), value)
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function backoffDelayMs(attempt, baseMs = 1000, maxMs = 8000) {
  return Math.min(maxMs, baseMs * 2 ** (attempt - 1))
}

function shouldRetryError(error) {
  const message = String(error?.message || error).toLowerCase()
  return (
    error?.name === 'AbortError' ||
    error?.code === 'ECONNRESET' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'EAI_AGAIN' ||
    message.includes('timed out') ||
    message.includes('connection reset') ||
    message.includes('fetch failed')
  )
}

async function fetchWithRetries(url, options, { label, attempts = 4, timeoutSeconds = 120, binary = false } = {}) {
  if (attempts < 1) fail('attempts must be >= 1')

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000)

    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)

      if (response.ok) {
        if (binary) {
          return Buffer.from(await response.arrayBuffer())
        }
        const text = await response.text()
        return text ? JSON.parse(text) : {}
      }

      const body = await response.text()
      const retryable = RETRYABLE_HTTP_STATUS.has(response.status)
      if (retryable && attempt < attempts) {
        const waitMs = backoffDelayMs(attempt)
        console.log(`${label} got HTTP ${response.status}; retrying in ${(waitMs / 1000).toFixed(1)}s (${attempt}/${attempts})`)
        await sleep(waitMs)
        continue
      }

      fail(`${label} failed: HTTP ${response.status} ${body}`)
    } catch (error) {
      clearTimeout(timeout)
      if (attempt < attempts && shouldRetryError(error)) {
        const waitMs = backoffDelayMs(attempt)
        console.log(`${label} network error (${error.message}); retrying in ${(waitMs / 1000).toFixed(1)}s (${attempt}/${attempts})`)
        await sleep(waitMs)
        continue
      }
      throw error
    }
  }

  fail(`${label} failed after ${attempts} attempts`)
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch (_error) {
    return false
  }
}

function parseDotenvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return null

  let [key, ...valueParts] = trimmed.split('=')
  key = key.trim()
  if (key.startsWith('export ')) key = key.slice(7).trim()
  if (!key) return null

  let value = valueParts.join('=').trim()
  const quote = value[0]
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1)
  }

  return [key, value]
}

async function loadDotenvFile(filePath) {
  if (!(await pathExists(filePath))) return
  const contents = await fs.readFile(filePath, 'utf8')

  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line)
    if (!parsed) continue
    const [key, value] = parsed
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function collectAncestorEnvFiles(startDir) {
  const files = []
  let current = path.resolve(startDir)

  while (true) {
    files.push(path.join(current, '.env'))
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return files
}

async function loadEnv() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    ...collectAncestorEnvFiles(process.cwd()),
    ...collectAncestorEnvFiles(scriptDir),
  ]
  const seen = new Set()

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    await loadDotenvFile(resolved)
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) {
      fail(`Invalid JSON in ${filePath}: ${error.message}`)
    }
    throw error
  }
}

function mutationDocument(mutation) {
  if (!mutation || typeof mutation !== 'object') return null
  return mutation.createOrReplace || mutation.create || null
}

function normalizeMutationPayload(rawPayload) {
  if (rawPayload && typeof rawPayload === 'object' && Array.isArray(rawPayload.mutations)) {
    const docs = rawPayload.mutations.map(mutationDocument).filter((doc) => doc?._type === 'article')
    return { payload: rawPayload, docs }
  }

  if (rawPayload && typeof rawPayload === 'object' && rawPayload._type === 'article') {
    return {
      payload: { mutations: [{ createOrReplace: rawPayload }] },
      docs: [rawPayload],
    }
  }

  return { payload: rawPayload, docs: [] }
}

function slugFromDoc(doc) {
  const value = doc?.slug?.current
  return typeof value === 'string' ? value.trim() : ''
}

function sanityBlocksToText(blocks) {
  const lines = []

  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block?._type !== 'block') continue

    const text = (Array.isArray(block.children) ? block.children : [])
      .filter((child) => child?._type === 'span')
      .map((child) => child.text || '')
      .join('')
      .trim()

    if (!text) continue
    lines.push(block.listItem ? `- ${text}` : text)
  }

  return lines.join('\n\n').trim()
}

function textByLevel(articleDoc) {
  const levels = articleDoc.levels && typeof articleDoc.levels === 'object' ? articleDoc.levels : {}
  const result = {}

  for (const level of ARTICLE_LEVELS) {
    const content = levels[level]?.content || []
    const text = sanityBlocksToText(content)
    if (!text) fail(`No speakable Portable Text content found for level '${level}'`)
    result[level] = text
  }

  return result
}

function splitLongSegment(segment, maxChars) {
  if (segment.length <= maxChars) return [segment]

  const sentenceParts = segment
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (sentenceParts.length <= 1) {
    const chunks = []
    for (let i = 0; i < segment.length; i += maxChars) {
      chunks.push(segment.slice(i, i + maxChars).trim())
    }
    return chunks.filter(Boolean)
  }

  return packSegments(sentenceParts, maxChars, ' ')
}

function packSegments(segments, maxChars, separator) {
  const chunks = []
  let current = ''

  for (const rawSegment of segments) {
    const segment = rawSegment.trim()
    if (!segment) continue

    if (segment.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
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

function chunkTextForTts(text, maxChars) {
  const normalized = String(text || '').trim()
  if (!normalized) fail('Cannot generate TTS from empty text')
  if (normalized.length <= maxChars) return [normalized]

  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  return packSegments(paragraphs, maxChars, '\n\n')
}

async function createSpeechChunk(text, options) {
  const payload = JSON.stringify({
    model: options.model,
    voice: options.voice,
    input: text,
    response_format: 'mp3',
    speed: options.speed,
  })

  return fetchWithRetries(
    'https://api.openai.com/v1/audio/speech',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: payload,
    },
    {
      label: 'OpenAI TTS',
      attempts: options.attempts,
      timeoutSeconds: options.timeoutSeconds,
      binary: true,
    },
  )
}

async function createSpeechMp3(text, outputPath, options) {
  const chunks = chunkTextForTts(text, options.maxChars)
  if (chunks.length > 1) {
    console.log(`Splitting ${path.basename(outputPath)} into ${chunks.length} TTS requests`)
  }

  const buffers = []
  for (let i = 0; i < chunks.length; i += 1) {
    const label = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''
    console.log(`Generating ${path.basename(outputPath)}${label}...`)
    buffers.push(await createSpeechChunk(chunks[i], options))
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, Buffer.concat(buffers))
}

function inferMimeType(filePath) {
  return MIME_BY_EXT.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
}

async function uploadAudioAsset(filePath, options) {
  const fileName = path.basename(filePath)
  const uploadUrl = `https://${options.projectId}.api.sanity.io/${options.apiVersion}/assets/files/${options.dataset}?filename=${encodeURIComponent(fileName)}`
  const body = await fs.readFile(filePath)
  const payload = await fetchWithRetries(
    uploadUrl,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': inferMimeType(filePath),
      },
      body,
    },
    {
      label: `Upload ${fileName}`,
      attempts: options.attempts,
      timeoutSeconds: options.timeoutSeconds,
    },
  )

  const assetId = payload?.document?._id || payload?._id || payload?.asset?._id
  if (!assetId) fail(`Asset upload returned no asset id for ${fileName}`)
  return assetId
}

function attachAudioRef(articleDoc, level, assetId) {
  if (!articleDoc.levels || typeof articleDoc.levels !== 'object') {
    articleDoc.levels = {}
  }

  if (!articleDoc.levels[level] || typeof articleDoc.levels[level] !== 'object') {
    articleDoc.levels[level] = {}
  }

  articleDoc.levels[level].audio = {
    _type: 'file',
    asset: {
      _type: 'reference',
      _ref: assetId,
    },
  }
}

async function postMutations(payload, options) {
  const mutateUrl = `https://${options.projectId}.api.sanity.io/${options.apiVersion}/data/mutate/${options.dataset}?autoGenerateArrayKeys=true&returnIds=true&visibility=sync`
  return fetchWithRetries(
    mutateUrl,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    {
      label: 'Sanity mutation',
      attempts: options.attempts,
      timeoutSeconds: options.timeoutSeconds,
    },
  )
}

function outputPathFor(articlePath) {
  const parsed = path.parse(articlePath)
  const extension = parsed.ext || '.json'
  return path.join(parsed.dir, `${parsed.name}.with-audio${extension}`)
}

function getSanityToken(args) {
  return (
    args['--token'] ||
    process.env.SANITY_API_TOKEN ||
    ''
  )
}

async function ensureExistingAudio(filePath, strict) {
  if (await pathExists(filePath)) return true
  const message = `Missing existing audio file: ${filePath}`
  if (strict) fail(message)
  console.log(`Warning: ${message}`)
  return false
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args['--help']) {
    printUsage()
    return
  }

  if (!args['--no-env']) {
    await loadEnv()
  }

  const articlePath = resolvePath(
    args['--article'] || args['--article-file'] || args['--news-file'] || args.positional[0],
  )
  if (!articlePath) fail('Missing --article <path>')
  if (!(await pathExists(articlePath))) fail(`Article file not found: ${articlePath}`)

  const rawPayload = await readJson(articlePath)
  const { payload, docs } = normalizeMutationPayload(rawPayload)
  if (!docs.length) fail('No _type:"article" documents found in the JSON payload')
  if (docs.length > 1) fail('This script expects exactly one article document per run')

  const articleDoc = docs[0]
  const slug = slugFromDoc(articleDoc)
  if (!slug) fail(`Could not read slug.current from ${articlePath}`)

  const levelText = textByLevel(articleDoc)
  console.log(`Slug: ${slug}`)
  for (const level of ARTICLE_LEVELS) {
    console.log(`${level}: ${levelText[level].length} chars`)
  }

  if (args['--dry-run']) {
    console.log('Dry run complete; skipped OpenAI and Sanity calls.')
    return
  }

  const audioDir = resolvePath(args['--audio-dir'], 'news/audios')
  const outputPath = resolvePath(args['--out'], outputPathFor(articlePath))
  const shouldPost = Boolean(args['--post'])
  const shouldUpload = shouldPost || Boolean(args['--upload'])
  const skipTts = Boolean(args['--skip-tts'])
  const strict = Boolean(args['--strict'])

  const audioFilesByLevel = {}
  if (!skipTts) {
    const openaiApiKey = args['--openai-api-key'] || process.env.OPENAI_API_KEY
    if (!openaiApiKey) fail('OPENAI_API_KEY is missing. Add it to .env or pass --openai-api-key.')

    const ttsOptions = {
      apiKey: openaiApiKey,
      model: args['--tts-model'] || process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL,
      voice: args['--voice'] || process.env.OPENAI_TTS_VOICE || DEFAULT_TTS_VOICE,
      speed: parseNumber(args['--speed'] || process.env.OPENAI_TTS_SPEED, DEFAULT_TTS_SPEED, '--speed'),
      maxChars: parseNumber(args['--max-tts-chars'], DEFAULT_MAX_TTS_CHARS, '--max-tts-chars'),
      attempts: parseNumber(args['--tts-attempts'], 4, '--tts-attempts'),
      timeoutSeconds: parseNumber(args['--timeout-seconds'], 120, '--timeout-seconds'),
    }

    for (const level of ARTICLE_LEVELS) {
      const audioPath = path.join(audioDir, `${slug}_${level}.mp3`)
      await createSpeechMp3(levelText[level], audioPath, ttsOptions)
      audioFilesByLevel[level] = audioPath
      console.log(`Saved: ${audioPath}`)
    }

    console.log(`Model: ${ttsOptions.model} | Voice: ${ttsOptions.voice} | Speed: ${ttsOptions.speed}`)
  } else {
    for (const level of ARTICLE_LEVELS) {
      const audioPath = path.join(audioDir, `${slug}_${level}.mp3`)
      if (await ensureExistingAudio(audioPath, strict)) {
        audioFilesByLevel[level] = audioPath
      }
    }
  }

  if (!shouldUpload) {
    console.log('Skipping Sanity upload and mutation. Pass --upload or --post to attach audio assets.')
    return
  }

  const sanityToken = getSanityToken(args)
  if (!sanityToken) fail('Missing Sanity token. Set SANITY_API_TOKEN or pass --token.')

  const sanityOptions = {
    token: sanityToken,
    projectId: args['--project-id'] || process.env.SANITY_PROJECT_ID || DEFAULT_PROJECT_ID,
    dataset: args['--dataset'] || process.env.SANITY_DATASET || DEFAULT_DATASET,
    apiVersion: normalizeApiVersion(args['--api-version'] || process.env.SANITY_API_VERSION || DEFAULT_API_VERSION),
    attempts: parseNumber(args['--sanity-attempts'], 5, '--sanity-attempts'),
    timeoutSeconds: parseNumber(args['--timeout-seconds'], 120, '--timeout-seconds'),
  }

  let uploadedCount = 0
  for (const level of ARTICLE_LEVELS) {
    const audioPath = audioFilesByLevel[level]
    if (!audioPath) continue

    console.log(`Uploading ${path.basename(audioPath)}...`)
    const assetId = await uploadAudioAsset(audioPath, sanityOptions)
    attachAudioRef(articleDoc, level, assetId)
    uploadedCount += 1
  }

  if (uploadedCount !== ARTICLE_LEVELS.length && strict) {
    fail(`Uploaded ${uploadedCount}/${ARTICLE_LEVELS.length} audio assets`)
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Wrote enriched mutation file: ${outputPath}`)
  console.log(`Uploaded ${uploadedCount} audio asset(s)`)

  if (!shouldPost) {
    console.log('Skipping mutation POST because --post was not supplied.')
    return
  }

  console.log('Posting mutations to Sanity...')
  const postResult = await postMutations(payload, {
    ...sanityOptions,
    attempts: parseNumber(args['--mutate-attempts'], 4, '--mutate-attempts'),
  })
  const resultCount = Array.isArray(postResult?.results) ? postResult.results.length : 0
  console.log(`Mutation posted successfully. transactionId=${postResult?.transactionId || 'n/a'}`)
  console.log(`Sanity returned ${resultCount} mutation result(s)`)
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`)
  process.exitCode = 1
})
