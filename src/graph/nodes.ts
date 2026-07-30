import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { createAgent } from 'langchain'
import { Send, interrupt } from '@langchain/langgraph'
import { z } from 'zod'
import type { State } from './state.js'
import type { Pitch, JournalistId, PostResult } from '../types.js'
import { JOURNALIST_PERSONAS } from '../personas.js'
import { ARTICLE_SCHEMA_REFERENCE } from '../schema.js'
import { createWebSearchTool } from '../tools/search.js'
import { postArticleWithAudio, uploadBase64ImageToSanity } from '../tools/postArticle.js'
import { ALL_JOURNALIST_IDS } from '../types.js'


// ─────────────────────────────────────────────
// Pitch phase
// ─────────────────────────────────────────────

const submitPitchSchema = z.object({
  title: z.string().describe('Proposed article title'),
  category: z
    .string()
    .describe(
      'Article category: politics-economics | culture | health | history | philosophy | science | society | technology | environment',
    ),
  leaning: z
    .string()
    .optional()
    .describe('Political leaning (politics-economics only): left | center-left | center-right | right | neutral'),
  agencyLevel: z
    .string()
    .optional()
    .describe('Agency level (politics-economics only): paralyzing | concerning | neutral | hopeful | empowering'),
  mode: z.string().optional().describe('Article mode: news | feature | explainer | list'),
  summary: z.string().describe('2-4 sentence summary of the story'),
  whyItMattersNow: z.string().describe('Why this story matters today'),
  sources: z.array(z.object({ name: z.string(), url: z.string() })).describe('At least 3 sources'),
  slug: z.string().describe('Suggested slug: lowercase-hyphen-only'),
})

export async function pitchJournalist(state: State): Promise<Partial<State>> {
  const journalistId = state.activeJournalistId
  const persona = JOURNALIST_PERSONAS[journalistId]

  console.log(`\n[${persona.emoji} ${persona.characterName}] Researching today's story...`)

  let capturedPitch: z.infer<typeof submitPitchSchema> | null = null

  const submitPitchTool = tool(
    async (args) => {
      capturedPitch = args
      return `Pitch submitted: "${args.title}"`
    },
    {
      name: 'submit_pitch',
      description: 'Submit your final pitch after researching. Call this ONCE when ready.',
      schema: submitPitchSchema,
    },
  )

  // const model = new ChatAnthropic({
  //   model: 'claude-opus-4-8',
  //   maxTokens: 2048,
  // })

  const model = new ChatOpenAI({
    model: 'gpt-5.4-2026-03-05',
    maxTokens: 4096,
  })

  const agent = createAgent({
    model,
    tools: [createWebSearchTool(), submitPitchTool],
    systemPrompt: persona.pitchSystemPrompt,
  })

  const humanMessage = state.pitchIdea
    ? `Today is ${state.date}. You have been given this story idea: "${state.pitchIdea}". ` +
      `Research this topic with at least 3 sources to build a fully sourced pitch. Then call submit_pitch with your structured pitch.`
    : `Today is ${state.date}. Search for ONE real story published today (or within the last 24 hours) that fits your domain. ` +
      `Verify with at least 3 sources. Then call submit_pitch with your structured pitch.`

  await agent.invoke({
    messages: [new HumanMessage(humanMessage)],
  })

  if (!capturedPitch) {
    console.warn(`[${persona.characterName}] No pitch submitted — using fallback`)
    capturedPitch = {
      title: `[${persona.characterName}] No pitch found for ${state.date}`,
      category: persona.categories[0],
      summary: 'No story found.',
      whyItMattersNow: 'N/A',
      sources: [],
      slug: `no-pitch-${journalistId}-${state.date}`,
    }
  }

  const pitch: Pitch = {
    journalistId,
    ...capturedPitch,
  }

  console.log(`[${persona.emoji} ${persona.characterName}] Pitch: "${pitch.title}"`)

  return {
    pitches: { [journalistId]: pitch },
  }
}

// ─────────────────────────────────────────────
// Selection phase (human-in-the-loop)
// ─────────────────────────────────────────────

export function presentPitches(state: State): Partial<State> {
  const pitches = state.pitches ?? {}
  const availableJournalistIds = ALL_JOURNALIST_IDS.filter((id) => !!pitches[id])
  const promptJournalistIds = (availableJournalistIds.length > 0 ? availableJournalistIds : ALL_JOURNALIST_IDS).join(', ')

  const pitchList = ALL_JOURNALIST_IDS.map((id) => {
    const pitch = pitches[id]
    if (!pitch) return `${id}: [No pitch]`
    const persona = JOURNALIST_PERSONAS[id]
    const lines = [
      `${id}: ${persona.emoji} ${persona.displayName} (${persona.characterName})`,
      `   Title: ${pitch.title}`,
      `   Category: ${pitch.category}${pitch.leaning ? ` | Leaning: ${pitch.leaning}` : ''}${pitch.agencyLevel ? ` | Agency: ${pitch.agencyLevel}` : ''}`,
      `   Summary: ${pitch.summary}`,
      `   Slug: ${pitch.slug}`,
    ]
    return lines.join('\n')
  }).join('\n\n')

  const hasPitches = Object.keys(pitches).length > 0
  const display = `\n${'─'.repeat(60)}\n📰 TODAY'S PITCHES — ${state.date}\n${'─'.repeat(60)}\n\n${pitchList}\n\n${'─'.repeat(60)}\n`

  if (!hasPitches) {
    console.warn('[Editor] No pitches found in state — journalists may not have completed yet.')
  }

  // Interrupt pauses the graph so Studio or an API client can resume it.
  const userResponse: string = interrupt({
    display,
    prompt: `Which articles should I generate? Enter journalist IDs (${promptJournalistIds}) or "all".`,
  })

  const selectedIds = parseSelection(userResponse, pitches)
  console.log(`\n[Editor] Selected: ${selectedIds.join(', ')}`)

  if (selectedIds.length === 0) {
    const available = availableJournalistIds.length > 0 ? availableJournalistIds.join(', ') : 'none'
    console.warn(`[Editor] No valid articles selected from input "${userResponse}". Available: ${available}`)
  }

  return { selectedIds }
}

function parseSelection(input: string, pitches: Record<string, Pitch> | undefined | null): JournalistId[] {
  const safePitches = pitches ?? {}
  const trimmed = input.trim().toLowerCase()

  if (trimmed === 'all') return ALL_JOURNALIST_IDS.filter((id) => !!safePitches[id])

  const requestedIds = new Set(trimmed.split(/[\s,]+/).filter(Boolean))

  return ALL_JOURNALIST_IDS.filter((id) => requestedIds.has(id) && !!safePitches[id])
}

// ─────────────────────────────────────────────
// Article generation phase
// ─────────────────────────────────────────────

export async function generateArticle(state: State): Promise<Partial<State>> {
  const journalistId = state.activeJournalistId
  const pitch = (state.pitches ?? {})[journalistId]
  const persona = JOURNALIST_PERSONAS[journalistId]

  if (!pitch) {
    console.warn(`[${persona.characterName}] No pitch found for generation, skipping.`)
    return {}
  }

  console.log(`\n[${persona.emoji} ${persona.characterName}] Generating full article: "${pitch.title}"`)

  const pitchContext = [
    `Title: ${pitch.title}`,
    `Category: ${pitch.category}`,
    pitch.leaning ? `Leaning: ${pitch.leaning}` : '',
    pitch.agencyLevel ? `Agency Level: ${pitch.agencyLevel}` : '',
    pitch.mode ? `Mode: ${pitch.mode}` : '',
    `Summary: ${pitch.summary}`,
    `Why it matters: ${pitch.whyItMattersNow}`,
    `Sources: ${pitch.sources.map((s) => `${s.name} (${s.url})`).join(', ')}`,
    `Slug: ${pitch.slug}`,
  ]
    .filter(Boolean)
    .join('\n')

  const systemPrompt = `${persona.articleSystemPrompt}

## Article Schema
${ARTICLE_SCHEMA_REFERENCE}

IMPORTANT: Return ONLY valid JSON — no markdown fences, no preamble, no trailing text.`

  const userPrompt = `Generate the full German Umbruch AI article for this pitch:

${pitchContext}

Use the web search tool during this call to verify the current facts, source details, and publication context before writing. Prefer the pitch sources when they are still relevant, and add or update source references only when the search results support them.

Today's date: ${state.date}
Generate the complete Sanity mutations JSON now.`

  // const model = new ChatAnthropic({
  //   model: 'claude-opus-4-8',
  //   maxTokens: 12000,
  // })
  const model = new ChatOpenAI({
    model: 'gpt-5.4-2026-03-05',
    maxTokens: 12000,
  })

  const response = await model.invoke([new SystemMessage(systemPrompt), new HumanMessage(userPrompt)], {
    tools: [createWebSearchTool()],
  })

  const rawContent = messageContentToText(response.content)
  const jsonString = extractJson(rawContent)

  // Validate it's parseable
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonString)
  } catch {
    throw new Error(`[${persona.characterName}] Generated JSON is not valid: ${jsonString.slice(0, 200)}`)
  }

  console.log(`[${persona.emoji} ${persona.characterName}] Generated → ${pitch.slug}`)

  return {
    articles: { [journalistId]: parsed },
  }
}

function messageContentToText(content: unknown): string {
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (!part || typeof part !== 'object') return ''

        const maybeText = (part as { text?: unknown }).text
        if (typeof maybeText === 'string') return maybeText

        const maybeReasoning = (part as { reasoning?: unknown }).reasoning
        if (typeof maybeReasoning === 'string') return maybeReasoning

        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return JSON.stringify(content)
}

function extractJson(text: string): string {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  // Find first { and last }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) return text.slice(start, end + 1)
  return text.trim()
}

export function routeGeneratedArticlesToValidation(state: State): Send[] {
  const articleIds = Object.keys(state.articles ?? {}).filter((id): id is JournalistId =>
    ALL_JOURNALIST_IDS.includes(id as JournalistId),
  )

  return articleIds.map((id) => new Send('validateAndFixArticle', { ...state, activeJournalistId: id }))
}

// ─────────────────────────────────────────────
// Validation & correction phase
// ─────────────────────────────────────────────

const VALIDATOR_SYSTEM_PROMPT = `You are a German-language article validator and fixer for the Umbruch AI news platform.

Validate the given article JSON against the schema, fix ALL issues, and call submit_validated_article with the corrected JSON string.

## CRITICAL: Level completeness (highest priority fix)
Every article MUST have all three levels (easy, medium, advanced), and EVERY level MUST contain:
- questions: at least 4 comprehension questions (non-empty array)
- vocabulary: at least 6 vocabulary items (non-empty array)
- content: at least 8 Portable Text blocks (non-empty array)

If the human message lists specific missing-level deficiencies, treat those as confirmed issues and fix them first.
If any level has an empty or missing questions or vocabulary array, GENERATE the missing items from the article content before calling submit_validated_article.
An empty questions or vocabulary array is a critical error — never submit the article with one.

## German Character Corrections
The article is in German. Fix ASCII substitutions back to proper German characters using your language knowledge:
- "oe" → "ö" in German words (schoen→schön, Schroeder→Schröder, NOT Noel, Roe, Joel, poet)
- "ae" → "ä" in German words (Maerz→März, aendern→ändern, NOT Israel, Michael, Rafael)
- "ue" → "ü" in German words (muessen→müssen, ueberpruefen→überprüfen, NOT fuel, blue, clue)
- "ss" → "ß" where correct in German (Strasse→Straße, heissen→heißen, muss→muss stays; compound "Klassenzimmer" keeps ss)

Apply corrections to ALL text fields: title, subtitle, summary, all content blocks, questions, vocabulary, commentary.

## Required Fields
Ensure the mutations object has all of these in the create document:
- _type: "article"
- slug: { _type: "slug", current: "lowercase-hyphen-slug" }
- date: ISO datetime string
- featured: boolean (default false if missing)
- category: one of (politics-economics|culture|health|history|philosophy|science|society|sports|technology|environment)
- region: one of (global|africa|asia|europe|latin-america|middle-east|north-america|oceania)
- language: "german"
- title: { easy, medium, advanced }
- subtitle: string
- summary: { easy, medium, advanced }
- commentary: politics-economics → each level has { humanConcern, opposingView, prompt }; all other categories → each level has { prompt } only
- aiAuthor: array
- agents: array of { _type: "reference", _ref: string }
- sources: array of { name, href, initials }
- levels: { easy, medium, advanced } — each with content (≥8 blocks), questions (≥4), vocabulary (≥6)

## Schema Violations to Fix
- leaning and agencyLevel: present ONLY for politics-economics; remove from all other categories
- humanConcern and opposingView in commentary: politics-economics ONLY
- content blocks: must have markDefs: [] if not present
- questions: multi must be boolean; exactly one isCorrect: true when multi is false
- vocabulary: exactly 4 options, exactly 1 isCorrect: true, all rationale text in German

## Instructions
1. Identify all issues (character encoding, missing fields, schema violations, missing questions/vocabulary per level)
2. Fix every issue — generate missing questions and vocabulary from article content when needed
3. Call submit_validated_article exactly once with the corrected full JSON string and the list of issues fixed`

const LEVELS = ['easy', 'medium', 'advanced'] as const

function checkLevelCompleteness(article: unknown): string[] {
  const issues: string[] = []

  const doc = (() => {
    if (!article || typeof article !== 'object') return null
    const p = article as { mutations?: Array<{ createOrReplace?: unknown; create?: unknown }> }
    if (Array.isArray(p.mutations)) {
      for (const m of p.mutations) {
        const d = (m.createOrReplace ?? m.create) as { _type?: string } | undefined
        if (d?._type === 'article') return d as Record<string, unknown>
      }
    }
    if ((article as { _type?: string })._type === 'article') return article as Record<string, unknown>
    return null
  })()

  if (!doc) {
    issues.push('Could not locate article document inside mutations envelope')
    return issues
  }

  const levels = doc.levels as Record<string, Record<string, unknown[]>> | undefined
  if (!levels) {
    issues.push('levels field is entirely missing')
    return issues
  }

  for (const level of LEVELS) {
    const lvl = levels[level] as Record<string, unknown[]> | undefined
    if (!lvl) {
      issues.push(`levels.${level} is missing`)
      continue
    }
    const q = lvl.questions
    const v = lvl.vocabulary
    const c = lvl.content
    if (!Array.isArray(q) || q.length < 4) {
      issues.push(`levels.${level}.questions has ${Array.isArray(q) ? q.length : 0} item(s) — minimum 4 required`)
    }
    if (!Array.isArray(v) || v.length < 6) {
      issues.push(`levels.${level}.vocabulary has ${Array.isArray(v) ? v.length : 0} item(s) — minimum 6 required`)
    }
    if (!Array.isArray(c) || c.length < 8) {
      issues.push(`levels.${level}.content has ${Array.isArray(c) ? c.length : 0} block(s) — minimum 8 required`)
    }
  }

  return issues
}

export async function validateAndFixArticle(state: State): Promise<Partial<State>> {
  const journalistId = state.activeJournalistId
  const article = (state.articles ?? {})[journalistId]
  const persona = JOURNALIST_PERSONAS[journalistId]

  if (!article) {
    console.warn(`[Validator] No article found for ${journalistId}, skipping.`)
    return {}
  }

  console.log(`\n[🔍 Validator] Checking article from ${persona.characterName}...`)

  const levelIssues = checkLevelCompleteness(article)
  if (levelIssues.length > 0) {
    console.warn(`[🔍 Validator] ⚠️  LEVEL COMPLETENESS ISSUES detected in ${persona.characterName}'s article:`)
    for (const issue of levelIssues) {
      console.warn(`  • ${issue}`)
    }
  }

  let fixedArticle: unknown = null

  const submitValidatedTool = tool(
    async (args) => {
      try {
        fixedArticle = JSON.parse(args.fixedJson)
        if (args.issues.length > 0) {
          console.log(`[🔍 Validator] Issues fixed: ${args.issues.join(' | ')}`)
        } else {
          console.log(`[🔍 Validator] No issues found.`)
        }
        return 'Validated article submitted.'
      } catch {
        return 'Error: fixedJson is not valid JSON — correct it and call again.'
      }
    },
    {
      name: 'submit_validated_article',
      description: 'Submit the fully corrected article JSON. Call this once when all fixes are applied.',
      schema: z.object({
        fixedJson: z.string().describe('The complete corrected article JSON as a string'),
        issues: z.array(z.string()).describe('List of issues found and fixed (empty array if none)'),
      }),
    },
  )

  const model = new ChatOpenAI({
    model: 'gpt-4.1-mini',
    maxTokens: 16000,
  })

  const agent = createAgent({
    model,
    tools: [submitValidatedTool],
    systemPrompt: VALIDATOR_SYSTEM_PROMPT,
  })

  const articleJson = JSON.stringify(article, null, 2)

  const levelIssuesPreamble =
    levelIssues.length > 0
      ? `DETECTED ISSUES (fix these first):\n${levelIssues.map((i) => `- ${i}`).join('\n')}\n\n`
      : ''

  await agent.invoke({
    messages: [
      new HumanMessage(
        `${levelIssuesPreamble}Validate and fix this article JSON. Correct all German character encoding, missing fields, and schema violations, then call submit_validated_article.\n\n${articleJson}`,
      ),
    ],
  })

  if (!fixedArticle) {
    console.warn(`[🔍 Validator] Agent did not submit — keeping original article for ${journalistId}.`)
    return {}
  }

  console.log(`[🔍 Validator] ✓ Validated article for ${persona.characterName}`)

  return {
    articles: { [journalistId]: fixedArticle },
  }
}

// ─────────────────────────────────────────────
// Image generation & review phase
// ─────────────────────────────────────────────

function extractDocFromArticle(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as { mutations?: Array<{ createOrReplace?: unknown; create?: unknown }> }
  if (Array.isArray(p.mutations)) {
    for (const m of p.mutations) {
      const d = (m.createOrReplace ?? m.create) as { _type?: string } | undefined
      if (d?._type === 'article') return d as Record<string, unknown>
    }
  }
  if ((raw as { _type?: string })._type === 'article') return raw as Record<string, unknown>
  return null
}

async function generateIllustrationPrompt(articleRaw: unknown, journalistId: string): Promise<string> {
  const doc = extractDocFromArticle(articleRaw)
  const titleObj = doc?.title as Record<string, string> | undefined
  const summaryObj = doc?.summary as Record<string, string> | undefined
  const title = titleObj?.medium ?? titleObj?.easy ?? journalistId
  const summary = summaryObj?.medium ?? summaryObj?.easy ?? ''
  const category = (doc?.category as string) ?? ''

  const model = new ChatOpenAI({ model: 'gpt-5.4-mini', maxTokens: 150 })
  const response = await model.invoke([
    new SystemMessage(
      `You create illustration prompts for New Yorker magazine-style editorial art.
Style: sophisticated ink-line or watercolor painting, metaphorical, elegant, clean composition.
NO text, letters, or words should appear in the image.
Return ONLY the illustration prompt — no explanation, no preamble. Max 80 words.`,
    ),
    new HumanMessage(
      `Create an illustration prompt for this news article:\nTitle: ${title}\nCategory: ${category}\nSummary: ${summary}`,
    ),
  ])

  const content = messageContentToText(response.content).trim()
  return content || `New Yorker editorial illustration, metaphorical depiction of ${title}`
}

async function callOpenAIImageGen(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing')

  // Prefix reinforces the aesthetic regardless of the user-supplied or LLM-generated prompt
  const fullPrompt = `New Yorker magazine editorial illustration, ink-line and watercolor, elegant composition, no text, no words, no letters: ${prompt}`

  const model = "gpt-image-2"
  // 16:9 aspect ratio
  const size = '1536x864'

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: fullPrompt,
      n: 1,
      size,
      quality:'low'
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI image generation failed: HTTP ${response.status} ${body}`)
  }

  const data = (await response.json()) as { data: Array<{ b64_json?: string; url?: string }> }
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI image generation returned no base64 data')
  return `data:image/png;base64,${b64}`
}

function injectLeadingImage(raw: unknown, imageAssetRef: string, slug: string): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const payload = raw as { mutations?: Array<Record<string, unknown>> }
  if (!Array.isArray(payload.mutations)) return raw

  const updatedMutations = payload.mutations.map((mutation) => {
    const docKey = 'createOrReplace' in mutation ? 'createOrReplace' : 'create'
    const doc = mutation[docKey] as Record<string, unknown> | undefined
    if (!doc || doc._type !== 'article') return mutation
    return {
      [docKey]: {
        ...doc,
        leadingImage: {
          image: {
            _type: 'image',
            asset: { _type: 'reference', _ref: imageAssetRef },
          },
          alternativeText: `Illustration für ${slug}`,
          credit: 'KI-generierte Illustration',
        },
      },
    }
  })

  return { ...payload, mutations: updatedMutations }
}

export async function generateArticleImage(state: State): Promise<Partial<State>> {
  const articleIds = Object.keys(state.articles) as JournalistId[]
  const nextId = articleIds.find((id) => !state.approvedImages[id])

  if (!nextId) return {}

  const article = state.articles[nextId]
  const persona = JOURNALIST_PERSONAS[nextId]
  const customPrompt = state.imageCustomPrompts[nextId]

  console.log(`\n[🎨 Illustrator] Generating image for ${persona.characterName}...`)

  let prompt: string
  if (customPrompt) {
    prompt = customPrompt
    console.log(`  Using custom prompt: "${prompt.slice(0, 100)}"`)
  } else {
    prompt = await generateIllustrationPrompt(article, nextId)
    console.log(`  Generated prompt: "${prompt.slice(0, 100)}"`)
  }

  const imageUrl = await callOpenAIImageGen(prompt)
  console.log(`  Base64 image generated (${Math.round(imageUrl.length / 1024)} KB data URL)`)

  // Clear the custom prompt that was just consumed
  const updatedCustomPrompts = { ...state.imageCustomPrompts }
  delete updatedCustomPrompts[nextId]

  return {
    pendingImages: { [nextId]: imageUrl },
    imageCustomPrompts: updatedCustomPrompts,
  }
}

export function reviewArticleImage(state: State): Partial<State> {
  const pendingEntries = Object.entries(state.pendingImages)
  if (pendingEntries.length === 0) return {}

  const [journalistId, imageUrl] = pendingEntries[0] as [JournalistId, string]
  const persona = JOURNALIST_PERSONAS[journalistId]
  const doc = extractDocFromArticle(state.articles[journalistId])
  const titleObj = doc?.title as Record<string, string> | undefined
  const title = titleObj?.medium ?? titleObj?.easy ?? journalistId

  const display = [
    `\n${'─'.repeat(60)}`,
    `🎨 ILLUSTRATION REVIEW — ${persona.emoji} ${persona.characterName}`,
    `${'─'.repeat(60)}`,
    `Article: "${title}"`,
    `${'─'.repeat(60)}`,
  ].join('\n')

  const userResponse: string = interrupt({
    display,
    image: imageUrl,
    prompt: 'Type "ok" to approve, or enter a custom prompt to regenerate the image:',
  })

  const trimmed = userResponse.trim().toLowerCase()
  const approved = trimmed === 'ok' || trimmed === 'okay' || trimmed === 'yes'

  const updatedPending = { ...state.pendingImages }
  delete updatedPending[journalistId]

  if (approved) {
    console.log(`[🎨 Illustrator] ✓ Image approved for ${persona.characterName}`)
    return {
      pendingImages: updatedPending,
      approvedImages: { [journalistId]: imageUrl },
    }
  } else {
    console.log(`[🎨 Illustrator] Custom prompt for ${persona.characterName}: "${userResponse.slice(0, 80)}"`)
    return {
      pendingImages: updatedPending,
      imageCustomPrompts: { ...state.imageCustomPrompts, [journalistId]: userResponse.trim() },
    }
  }
}

export function routeAfterValidation(state: State): string {
  return state.skipImageGeneration ? 'postAllArticles' : 'generateArticleImage'
}

export function routeAfterImageReview(state: State): string {
  const articleIds = Object.keys(state.articles) as JournalistId[]
  const hasUnapproved = articleIds.some((id) => !state.approvedImages[id])
  return hasUnapproved ? 'generateArticleImage' : 'postAllArticles'
}

// ─────────────────────────────────────────────
// Posting phase (sequential)
// ─────────────────────────────────────────────

export async function postAllArticles(state: State): Promise<Partial<State>> {
  const entries = Object.entries(state.articles)
  if (entries.length === 0) {
    console.log('\n[Editor] No articles to post.')
    return { postResults: [] }
  }

  const results: PostResult[] = []

  for (const [journalistId, articleData] of entries) {
    const pitch = state.pitches[journalistId]
    const slug = pitch?.slug ?? journalistId
    console.log(`\n[Editor] Posting "${slug}"...`)

    const rawImageUrl = state.approvedImages[journalistId]
    let imageAssetRef = rawImageUrl
    if (rawImageUrl?.startsWith('data:')) {
      imageAssetRef = await uploadBase64ImageToSanity(rawImageUrl)
      console.log(`[Editor] Image asset uploaded: ${imageAssetRef}`)
    }
    const articleWithImage = imageAssetRef ? injectLeadingImage(articleData, imageAssetRef, slug) : articleData

    try {
      const output = await postArticleWithAudio(articleWithImage)
      results.push({ slug, success: true, output })
      console.log(`[Editor] ✓ Posted "${slug}"`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ slug, success: false, output: message })
      console.error(`[Editor] ✗ Failed "${slug}": ${message}`)
    }
  }

  return { postResults: results }
}

// ─────────────────────────────────────────────
// Final desk note
// ─────────────────────────────────────────────

export function finalNote(state: State): Partial<State> {
  const lines = [`\n${'═'.repeat(60)}`, `✅ TODAY'S UMBRUCH AI EDITION — ${state.date}`, `${'═'.repeat(60)}`]

  for (const result of state.postResults) {
    const icon = result.success ? '✓' : '✗'
    const pitch = Object.values(state.pitches).find((p) => p.slug === result.slug)
    const categoryInfo = pitch
      ? ` — ${pitch.category}${pitch.leaning ? ` (${pitch.leaning})` : ''}`
      : ''
    lines.push(`${icon} ${result.slug}${categoryInfo}`)
  }

  const blockers = state.postResults.filter((r) => !r.success)
  lines.push('')
  lines.push(`Blockers: ${blockers.length === 0 ? 'none' : blockers.map((b) => b.slug).join(', ')}`)
  lines.push('═'.repeat(60))

  console.log(lines.join('\n'))
  return {}
}
