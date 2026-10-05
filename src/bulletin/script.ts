import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { ARTICLE_MODEL } from '../graph/nodes.js'
import type { BulletinArticle } from './articles.js'
import type { BulletinScript, ScriptSegment } from './manifest.js'

const anchorScriptSchema = z.object({
  intro: z.string().describe('Greeting, date and a one-sentence teaser of the bulletin'),
  stories: z
    .array(
      z.object({
        slug: z.string().describe('Slug of the article this segment reads'),
        text: z.string().describe('The spoken segment for this article'),
      }),
    )
    .describe('One segment per article, in the order the presenter reads them'),
  outro: z.string().describe('Short sign-off'),
})

/**
 * The anchor voice reads about 1.85 words per second, and the track adds about 7 s
 * of silence, so ~200 spoken words make a bulletin of roughly two minutes.
 */
const TARGET_WORDS = 200
const INTRO_MAX_WORDS = 25
const OUTRO_MAX_WORDS = 15

function systemPrompt(storyCount: number): string {
  const storyMax = Math.floor((TARGET_WORDS - INTRO_MAX_WORDS - OUTRO_MAX_WORDS) / storyCount)
  const storyMin = Math.round(storyMax * 0.75)
  return `Du schreibst das Sprechmanuskript für die tägliche Videonachrichtensendung von Umbruch AI.
Eine Nachrichtensprecherin liest es vor; ein Sprachsynthese-Modell spricht den Text genau so, wie du ihn schreibst.

Aufbau:
- Die ganze Sendung dauert etwa zwei Minuten: insgesamt höchstens ${TARGET_WORDS} Wörter. Halte dich streng an die Wortgrenzen.
- intro: Begrüßung („Guten Tag und willkommen bei den Nachrichten von Umbruch AI“ o. Ä.) mit dem Datum und ein kurzer Satz, der die Themen anreißt. Höchstens 2 Sätze und ${INTRO_MAX_WORDS} Wörter.
- stories: genau ein Abschnitt pro Artikel, jeder Artikel genau einmal. Beginne mit der wichtigsten Nachricht. Jeder Abschnitt hat ${storyMin} bis ${storyMax} Wörter, bringt nur den Kern der Nachricht und beginnt mit einer knappen, natürlichen Überleitung, die nicht jedes Mal gleich klingt.
- outro: ein oder zwei kurze Sätze zum Abschied, höchstens ${OUTRO_MAX_WORDS} Wörter. Du darfst erwähnen, dass die ganzen Artikel bei Umbruch AI in drei Sprachniveaus zu lesen sind.

Inhalt:
- Verwende nur Fakten aus Titel, Untertitel und Zusammenfassung der Artikel. Ergänze nichts aus eigenem Wissen.
- Bleib als Sprecherin neutral. Wertungen, Forderungen oder Thesen eines Artikels schreibst du dem Artikel oder seiner Autorin bzw. seinem Autor zu („…, meint unser Autor William F. Brooks“), statt sie als Tatsache zu sprechen.

Sprache fürs Hören:
- Kurze, klare Sätze in Standarddeutsch, gesprochene Nachrichtensprache, Sie-Form.
- Keine Klammern, Listen, Links, Emojis, Anführungszeichen-Spielereien oder Abkürzungen, die man nicht ausspricht (schreib „zum Beispiel“ statt „z. B.“, „Prozent“ statt „%“).
- Zahlen so, wie man sie vorliest, wenn die Ziffern holprig wären.`
}

function articleBrief(article: BulletinArticle): string {
  return [
    `Slug: ${article.slug}`,
    `Rubrik: ${article.category}`,
    article.journalist ? `Autor/in: ${article.journalist}` : null,
    `Titel: ${article.title}`,
    article.subtitle ? `Untertitel: ${article.subtitle}` : null,
    `Zusammenfassung: ${article.summary}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Asks the article model for a spoken anchor script covering every article once. */
export async function writeAnchorScript(
  articles: BulletinArticle[],
  date: string,
  dateLabel: string,
): Promise<BulletinScript> {
  const model = new ChatOpenAI({ model: ARTICLE_MODEL, maxTokens: 6000 }).withStructuredOutput(anchorScriptSchema, {
    name: 'submit_anchor_script',
  })

  const result = await model.invoke([
    new SystemMessage(systemPrompt(articles.length)),
    new HumanMessage(
      `Sendung vom ${dateLabel}. ${articles.length} Artikel:\n\n${articles.map(articleBrief).join('\n\n---\n\n')}`,
    ),
  ])

  const bySlug = new Map(articles.map((article) => [article.slug, article]))
  const seen = new Set<string>()
  const storySegments: ScriptSegment[] = []

  for (const story of result.stories) {
    const article = bySlug.get(story.slug)
    if (!article || seen.has(story.slug)) {
      console.warn(`  Ignoring script segment for unknown or repeated slug '${story.slug}'`)
      continue
    }
    seen.add(story.slug)
    storySegments.push({
      kind: 'story',
      text: story.text.trim(),
      story: {
        slug: article.slug,
        category: article.category,
        title: article.title,
        subtitle: article.subtitle,
        imageUrl: article.imageUrl,
        journalist: article.journalist,
      },
    })
  }

  const missing = articles.filter((article) => !seen.has(article.slug)).map((article) => article.slug)
  if (missing.length) throw new Error(`Anchor script skipped articles: ${missing.join(', ')}`)

  return {
    date,
    dateLabel,
    segments: [
      { kind: 'intro', text: result.intro.trim() },
      ...storySegments,
      { kind: 'outro', text: result.outro.trim() },
    ],
  }
}
