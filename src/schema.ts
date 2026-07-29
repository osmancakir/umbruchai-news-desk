// Inlined from .claude/skills/news-generator/references/schema.md
export const ARTICLE_SCHEMA_REFERENCE = `
# Article JSON Schema Reference

## Top-level shape

Wrap in a Sanity mutations envelope:

{
  "mutations": [{
    "create": {
      "_type": "article",
      "slug": { "_type": "slug", "current": "lowercase-hyphen-slug" },
      "date": "2026-05-29T12:00:00.000Z",
      "featured": false,
      "category": "politics-economics",
      "region": "europe",
      "language": "german",
      "leaning": "center-left",        // politics-economics only
      "agencyLevel": "neutral",         // politics-economics only
      "title": { "easy": "...", "medium": "...", "advanced": "..." },
      "subtitle": "...",
      "summary": { "easy": "...", "medium": "...", "advanced": "..." },
      "commentary": {
        // politics-economics: include humanConcern and opposingView
        "easy":     { "humanConcern": "...", "opposingView": "...", "prompt": "..." },
        "medium":   { "humanConcern": "...", "opposingView": "...", "prompt": "..." },
        "advanced": { "humanConcern": "...", "opposingView": "...", "prompt": "..." }
        // all other categories: prompt only
        // "easy": { "prompt": "..." }, ...
      },
      "aiAuthor": [{ "name": "claude-opus-4-8", "role": "author", "version": "4.8" }],
      "luAuthors": [{ "_type": "reference", "_ref": "<author-document-_id>" }],
      "sources": [{ "name": "Reuters", "href": "https://...", "initials": "RE" }],
      "relatedLinks": [{ "name": "Background", "href": "https://..." }],
      "leadingImage": {
        "image": { "_type": "image", "asset": { "_type": "reference", "_ref": "image-<id>-<ext>" } },
        "alternativeText": "...",
        "caption": "...",
        "credit": "..."
      },
      "levels": {
        "easy":     { "content": [], "questions": [], "vocabulary": [] },
        "medium":   { "content": [], "questions": [], "vocabulary": [] },
        "advanced": { "content": [], "questions": [], "vocabulary": [] }
      }
    }
  }]
}

## Category values (use string, not reference)
politics-economics | culture | health | history | philosophy | science | society | sports | technology | environment

## Language values
english | german | irish | turkish
Default for this workflow: "german"

## Region values
global | africa | asia | europe | latin-america | middle-east | north-america | oceania

## Per-level minimums (ALL THREE LEVELS — easy, medium, advanced — MUST have questions AND vocabulary; empty arrays are not allowed)
- content: 8 blocks minimum (≥1 heading h2, ≥4 paragraphs, ≥1 bullet list)
- questions: 4 minimum per level — required for every level, no exceptions
- vocabulary: 6 minimum per level — required for every level, no exceptions
Before outputting JSON, count questions and vocabulary for each level. Generate missing items if any level is short.

## Portable Text content blocks

Paragraph:
{ "_type": "block", "style": "normal", "children": [{ "_type": "span", "text": "...", "marks": [] }], "markDefs": [] }

Heading:
{ "_type": "block", "style": "h2", "children": [{ "_type": "span", "text": "...", "marks": [] }], "markDefs": [] }

Bullet (each item is its own block):
{ "_type": "block", "style": "normal", "listItem": "bullet", "level": 1, "children": [{ "_type": "span", "text": "...", "marks": [] }], "markDefs": [] }

markDefs must always be present (empty array is fine).

## Question format
{
  "prompt": "German comprehension question...",
  "multi": false,
  "options": [
    { "label": "Antwort A", "isCorrect": true },
    { "label": "Antwort B", "isCorrect": false },
    { "label": "Antwort C", "isCorrect": false }
  ]
}
- Provide 3-4 options. Exactly one isCorrect: true for multi: false.
- IMPORTANT: Vary the position of the correct answer — do NOT default to first option. Distribute correct answers across all positions across the question set.

## Vocabulary format
{
  "term": "die Regierung",
  "type": "Nomen",
  "question": "Die _____ entscheidet über das Gesetz.",
  "hint": "Eine Gruppe, die ein Land führt.",
  "options": [
    { "label": "Regierung", "isCorrect": true, "rationale": "Richtig: Die Regierung führt politische Entscheidungen aus." },
    { "label": "Wolke",     "isCorrect": false, "rationale": "Falsch: Eine Wolke ist kein politisches Organ." },
    { "label": "Melodie",   "isCorrect": false, "rationale": "Falsch: Eine Melodie gehört zur Musik." },
    { "label": "Tasse",     "isCorrect": false, "rationale": "Falsch: Eine Tasse ist ein Gegenstand." }
  ],
  "definition": "Eine Gruppe von Personen, die ein Land leitet.",
  "example": "Die Regierung stellt einen neuen Plan vor."
}
- Exactly 4 options, exactly 1 correct. All rationale in German. German nouns include grammatical article in term.
- IMPORTANT: Vary the position of the correct answer — do NOT default to first option. Distribute correct answers across all positions across the vocabulary set.

## Rules
- Return ONLY valid JSON — no markdown fences, no comments, no preamble.
- Do not include removed fields: readingTime, editorial, crosswordMeta, newsLanguage refs, newsCategory refs.
- Use absolute HTTPS URLs in sources.
- leadingImage.image is set automatically by the posting pipeline (Sanity asset upload); omit it from generated JSON.
- leaning, agencyLevel, humanConcern, opposingView: politics-economics ONLY.
`
