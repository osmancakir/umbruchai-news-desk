import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeArticlePayload,
  validateArticle,
  validateArticleReplacement,
} from '../../src/articleValidation.js'
import { validArticlePayload } from '../helpers/articleFixture.js'

describe('article validation', () => {
  it('accepts a complete three-level article', () => {
    assert.deepEqual(validateArticle(validArticlePayload()), [])
  })

  it('detects the missing quizzes seen in the failed left-wing article', () => {
    const article = validArticlePayload()
    const doc = article.mutations[0].create
    delete (doc.levels.advanced as { questions?: unknown }).questions
    delete (doc.levels.advanced as { vocabulary?: unknown }).vocabulary

    const issues = validateArticle(article)
    assert(issues.includes('levels.advanced.questions must be an array'))
    assert(issues.includes('levels.advanced.vocabulary must be an array'))
  })

  it('rejects a validator replacement that loses vocabulary', () => {
    const original = validArticlePayload()
    const replacement = structuredClone(original)
    replacement.mutations[0].create.levels.easy.vocabulary.pop()

    const issues = validateArticleReplacement(original, replacement)
    assert(issues.includes('levels.easy.vocabulary has 5 item(s); minimum 6 required'))
  })

  it('strips validator metadata from the Sanity mutation envelope', () => {
    const raw = { ...validArticlePayload(), issues: ['model note'] }
    const normalized = normalizeArticlePayload(raw)

    assert.deepEqual(Object.keys(normalized.payload), ['mutations'])
    assert.equal('issues' in normalized.payload, false)
  })
})
