const ARTICLE_LEVELS = ['easy', 'medium', 'advanced'] as const

const CATEGORIES = new Set([
  'politics-economics',
  'culture',
  'health',
  'history',
  'philosophy',
  'science',
  'society',
  'sports',
  'technology',
  'environment',
])

const REGIONS = new Set([
  'global',
  'africa',
  'asia',
  'europe',
  'latin-america',
  'middle-east',
  'north-america',
  'oceania',
])

type ArticleDocument = Record<string, unknown>

export interface ArticleMutationPayload {
  mutations: Array<{
    create?: ArticleDocument
    createOrReplace?: ArticleDocument
  }>
}

export interface NormalizedArticlePayload {
  payload: ArticleMutationPayload
  doc: ArticleDocument
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Reduces model output to the one mutation shape this pipeline supports. Besides
 * making direct article objects convenient, this prevents validator metadata
 * such as a top-level `issues` property from leaking into the Sanity API body.
 */
export function normalizeArticlePayload(raw: unknown): NormalizedArticlePayload {
  if (isRecord(raw) && raw._type === 'article') {
    const payload: ArticleMutationPayload = { mutations: [{ create: raw }] }
    return { payload, doc: raw }
  }

  if (!isRecord(raw) || !Array.isArray(raw.mutations)) {
    throw new Error('No Sanity mutations array or _type:"article" document found')
  }

  const articleMutations = raw.mutations.flatMap((mutation) => {
    if (!isRecord(mutation)) return []
    const operation = isRecord(mutation.create)
      ? 'create'
      : isRecord(mutation.createOrReplace)
        ? 'createOrReplace'
        : null
    if (!operation) return []
    const doc = mutation[operation] as ArticleDocument
    return doc._type === 'article' ? [{ operation, doc }] : []
  })

  if (articleMutations.length !== 1) {
    throw new Error(`Expected exactly one article mutation, found ${articleMutations.length}`)
  }

  const [{ operation, doc }] = articleMutations
  const mutation = operation === 'create' ? { create: doc } : { createOrReplace: doc }
  return { payload: { mutations: [mutation] }, doc }
}

function validateLocalizedStrings(value: unknown, path: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object with easy, medium, and advanced strings`)
    return
  }
  for (const level of ARTICLE_LEVELS) {
    if (!nonEmptyString(value[level])) issues.push(`${path}.${level} must be a non-empty string`)
  }
}

function validateContent(value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`)
    return
  }
  if (value.length < 8) issues.push(`${path} has ${value.length} block(s); minimum 8 required`)

  let headings = 0
  let paragraphs = 0
  let bullets = 0
  value.forEach((block, index) => {
    if (!isRecord(block) || block._type !== 'block') {
      issues.push(`${path}[${index}] must be a Portable Text block`)
      return
    }
    if (!Array.isArray(block.markDefs)) issues.push(`${path}[${index}].markDefs must be an array`)
    if (!Array.isArray(block.children) || block.children.length === 0) {
      issues.push(`${path}[${index}].children must be a non-empty array`)
    }
    if (block.style === 'h2') headings += 1
    if (block.style === 'normal' && block.listItem !== 'bullet') paragraphs += 1
    if (block.listItem === 'bullet') bullets += 1
  })

  if (headings < 1) issues.push(`${path} must contain at least 1 h2 heading`)
  if (paragraphs < 4) issues.push(`${path} must contain at least 4 paragraphs`)
  if (bullets < 1) issues.push(`${path} must contain at least 1 bullet item`)
}

function validateQuestions(value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`)
    return
  }
  if (value.length < 4) issues.push(`${path} has ${value.length} item(s); minimum 4 required`)

  value.forEach((question, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(question)) {
      issues.push(`${itemPath} must be an object`)
      return
    }
    if (!nonEmptyString(question.prompt)) issues.push(`${itemPath}.prompt must be a non-empty string`)
    if (typeof question.multi !== 'boolean') issues.push(`${itemPath}.multi must be a boolean`)
    if (!Array.isArray(question.options) || question.options.length < 3 || question.options.length > 4) {
      issues.push(`${itemPath}.options must contain 3 or 4 options`)
      return
    }
    const correct = question.options.filter((option) => isRecord(option) && option.isCorrect === true).length
    if (question.multi === false && correct !== 1) {
      issues.push(`${itemPath}.options must have exactly 1 correct answer when multi is false`)
    } else if (question.multi === true && correct < 1) {
      issues.push(`${itemPath}.options must have at least 1 correct answer when multi is true`)
    }
  })
}

function validateVocabulary(value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`)
    return
  }
  if (value.length < 6) issues.push(`${path} has ${value.length} item(s); minimum 6 required`)

  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(entry)) {
      issues.push(`${itemPath} must be an object`)
      return
    }
    for (const field of ['term', 'type', 'question', 'hint', 'definition', 'example']) {
      if (!nonEmptyString(entry[field])) issues.push(`${itemPath}.${field} must be a non-empty string`)
    }
    if (!Array.isArray(entry.options) || entry.options.length !== 4) {
      issues.push(`${itemPath}.options must contain exactly 4 options`)
      return
    }
    const correct = entry.options.filter((option) => isRecord(option) && option.isCorrect === true).length
    if (correct !== 1) issues.push(`${itemPath}.options must have exactly 1 correct answer`)
    entry.options.forEach((option, optionIndex) => {
      if (!isRecord(option) || !nonEmptyString(option.rationale)) {
        issues.push(`${itemPath}.options[${optionIndex}].rationale must be a non-empty German string`)
      }
    })
  })
}

export function validateArticle(raw: unknown): string[] {
  const issues: string[] = []
  let doc: ArticleDocument

  try {
    doc = normalizeArticlePayload(raw).doc
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)]
  }

  if (doc._type !== 'article') issues.push('_type must be "article"')
  const slug = isRecord(doc.slug) ? doc.slug.current : undefined
  if (!nonEmptyString(slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug as string)) {
    issues.push('slug.current must be a non-empty lowercase-hyphen slug')
  }
  if (!nonEmptyString(doc.date) || Number.isNaN(Date.parse(doc.date as string))) {
    issues.push('date must be an ISO datetime string')
  }
  if (typeof doc.featured !== 'boolean') issues.push('featured must be a boolean')
  if (!CATEGORIES.has(String(doc.category))) issues.push('category is missing or unsupported')
  if (!REGIONS.has(String(doc.region))) issues.push('region is missing or unsupported')
  if (doc.language !== 'german') issues.push('language must be "german"')

  validateLocalizedStrings(doc.title, 'title', issues)
  validateLocalizedStrings(doc.summary, 'summary', issues)
  if (!nonEmptyString(doc.subtitle)) issues.push('subtitle must be a non-empty string')

  if (!Array.isArray(doc.aiAuthor) || doc.aiAuthor.length === 0) issues.push('aiAuthor must be a non-empty array')
  if (!Array.isArray(doc.agents) || doc.agents.length === 0) issues.push('agents must be a non-empty array')
  if (!Array.isArray(doc.sources) || doc.sources.length === 0) issues.push('sources must be a non-empty array')

  const political = doc.category === 'politics-economics'
  if (political) {
    if (!nonEmptyString(doc.leaning)) issues.push('leaning is required for politics-economics')
    if (!nonEmptyString(doc.agencyLevel)) issues.push('agencyLevel is required for politics-economics')
  } else {
    if (doc.leaning !== undefined) issues.push('leaning is only allowed for politics-economics')
    if (doc.agencyLevel !== undefined) issues.push('agencyLevel is only allowed for politics-economics')
  }

  if (!isRecord(doc.commentary)) {
    issues.push('commentary must contain easy, medium, and advanced objects')
  } else {
    for (const level of ARTICLE_LEVELS) {
      const commentary = doc.commentary[level]
      if (!isRecord(commentary) || !nonEmptyString(commentary.prompt)) {
        issues.push(`commentary.${level}.prompt must be a non-empty string`)
        continue
      }
      if (political) {
        if (!nonEmptyString(commentary.humanConcern)) {
          issues.push(`commentary.${level}.humanConcern is required for politics-economics`)
        }
        if (!nonEmptyString(commentary.opposingView)) {
          issues.push(`commentary.${level}.opposingView is required for politics-economics`)
        }
      } else if (commentary.humanConcern !== undefined || commentary.opposingView !== undefined) {
        issues.push(`commentary.${level} political fields are only allowed for politics-economics`)
      }
    }
  }

  if (!isRecord(doc.levels)) {
    issues.push('levels must contain easy, medium, and advanced objects')
    return issues
  }

  for (const level of ARTICLE_LEVELS) {
    const levelValue = doc.levels[level]
    const path = `levels.${level}`
    if (!isRecord(levelValue)) {
      issues.push(`${path} is missing`)
      continue
    }
    validateContent(levelValue.content, `${path}.content`, issues)
    validateQuestions(levelValue.questions, `${path}.questions`, issues)
    validateVocabulary(levelValue.vocabulary, `${path}.vocabulary`, issues)
  }

  return issues
}

export function assertValidArticle(raw: unknown): void {
  const issues = validateArticle(raw)
  if (issues.length > 0) throw new Error(`Article validation failed:\n- ${issues.join('\n- ')}`)
}

function requiredCollectionLengths(raw: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  let doc: ArticleDocument
  try {
    doc = normalizeArticlePayload(raw).doc
  } catch {
    return result
  }
  const levels = isRecord(doc.levels) ? doc.levels : {}
  for (const level of ARTICLE_LEVELS) {
    const value = isRecord(levels[level]) ? levels[level] : {}
    for (const field of ['content', 'questions', 'vocabulary']) {
      result[`${level}.${field}`] = Array.isArray(value[field]) ? value[field].length : 0
    }
  }
  return result
}

/** Returns every reason a model-produced replacement is unsafe to accept. */
export function validateArticleReplacement(original: unknown, candidate: unknown): string[] {
  const issues = validateArticle(candidate)
  if (issues.length > 0) return issues

  const before = requiredCollectionLengths(original)
  const after = requiredCollectionLengths(candidate)
  for (const [path, count] of Object.entries(before)) {
    if ((after[path] ?? 0) < count) {
      issues.push(`levels.${path} regressed from ${count} to ${after[path] ?? 0} item(s)`)
    }
  }
  return issues
}
