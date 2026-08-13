import assert from 'node:assert/strict'
import { it } from 'node:test'
import { postArticleWithAudio } from '../../src/tools/postArticle.js'
import { validArticlePayload } from '../helpers/articleFixture.js'

it('blocks an incomplete article before TTS, uploads, or Sanity posting', async () => {
  const article = validArticlePayload()
  article.mutations[0].create.levels.advanced.questions = []
  article.mutations[0].create.levels.advanced.vocabulary = []

  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('Network must not be reached for an invalid article')
  }) as typeof fetch

  try {
    await assert.rejects(
      postArticleWithAudio(article),
      /levels\.advanced\.questions has 0 item\(s\); minimum 4 required/,
    )
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
