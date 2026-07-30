# Article JSON Schema Reference

## Top-level shape

Wrap the document in a Sanity mutations envelope:

```json
{
  "mutations": [
    {
      "create": {
        "_type": "article",
        "slug": { "_type": "slug", "current": "lowercase-hyphen-slug" },
        "date": "2026-05-24T12:00:00.000Z",
        "featured": false,
        "category": "politics-economics",
        "region": "europe",
        "language": "german",
        "leaning": "center-left",
        "agencyLevel": "neutral",
        "title": { "easy": "...", "medium": "...", "advanced": "..." },
        "subtitle": "...",
        "summary": { "easy": "...", "medium": "...", "advanced": "..." },
        "commentary": {
          "easy": { "humanConcern": "...", "opposingView": "...", "prompt": "..." },
          "medium": { "humanConcern": "...", "opposingView": "...", "prompt": "..." },
          "advanced": { "humanConcern": "...", "opposingView": "...", "prompt": "..." }
        },
        "aiAuthor": [{ "name": "gpt-5", "role": "author", "version": "5" }],
        "sources": [{ "name": "...", "href": "https://...", "initials": "..." }],
        "relatedLinks": [{ "name": "...", "href": "https://..." }],
        "leadingImage": {
          "externalUrl": "https://...",
          "alternativeText": "...",
          "caption": "...",
          "credit": "..."
        },
        "levels": {
          "easy": { "content": [], "questions": [], "vocabulary": [] },
          "medium": { "content": [], "questions": [], "vocabulary": [] },
          "advanced": { "content": [], "questions": [], "vocabulary": [] }
        }
      }
    }
  ]
}
```

`leaning`, `agencyLevel`, `commentary.<level>.humanConcern`, and `commentary.<level>.opposingView` are for `politics-economics` only. Omit those fields for every other category.

Do not include removed fields from older schemas: `readingTime`, `editorial`, `crosswordMeta`, `newsLanguage` references, or `newsCategory` references.

## Required and optional top-level fields

Required:

- `_type`: always `"article"`.
- `slug`: Sanity slug object with `current`.
- `date`: ISO 8601 datetime string.
- `category`: string from Category values.
- `language`: string from Language values.
- `title`: object with `easy`, `medium`, `advanced`.
- `summary`: object with `easy`, `medium`, `advanced`.
- `sources`: array with at least one source.
- `levels`: object with `easy`, `medium`, `advanced` level content.

Usually include:

- `featured`: default `false`.
- `region`: best matching Region value.
- `commentary`: include `prompt` for all categories; add politics-only fields only for `politics-economics`.
- `aiAuthor`: one object identifying the generating model with role `"author"`.

Optional:

- `subtitle`
- `tags`: references to existing `tag` documents only if IDs are known.
- `series`: reference to an existing `articleSeries` only if an ID is known.
- `seriesOrder`: positive integer, only when `series` is included.
- `agents`: references to existing `author` documents only if IDs are known. Format:
  ```json
  "agents": [{ "_type": "reference", "_ref": "<author-document-_id>" }]
  ```
- `relatedLinks`
- `leadingImage`

## Category values

Use exactly one string:

| Label | Value |
| --- | --- |
| Politics & Economics | `politics-economics` |
| Culture | `culture` |
| Health | `health` |
| History | `history` |
| Philosophy | `philosophy` |
| Science | `science` |
| Society | `society` |
| Sports | `sports` |
| Technology | `technology` |
| Environment | `environment` |

## Language values

Use exactly one string:

```text
english | german | irish | turkish
```

For the current German news workflow, use `"german"` unless the user explicitly asks for another supported language.

## Region values

Use exactly one string when `region` is included:

```text
global | africa | asia | europe | latin-america | middle-east | north-america | oceania
```

Choose the region that best matches the story's primary geographic focus. Use `"global"` only when the story genuinely spans multiple continents with no dominant regional focus.

## Politics & Economics fields

Only include these top-level fields when `category` is `"politics-economics"`:

```json
{
  "leaning": "center-left",
  "agencyLevel": "neutral"
}
```

`leaning` values:

```text
left | center-left | center-right | right | neutral
```

`agencyLevel` values:

```text
paralyzing | concerning | neutral | hopeful | empowering
```

## Commentary

For `politics-economics`, include:

```json
{
  "commentary": {
    "easy": {
      "humanConcern": "German A2-level text...",
      "opposingView": "German A2-level text...",
      "prompt": "German A2-level critical-thinking question..."
    },
    "medium": {
      "humanConcern": "German B1-B2-level text...",
      "opposingView": "German B1-B2-level text...",
      "prompt": "German B1-B2-level critical-thinking question..."
    },
    "advanced": {
      "humanConcern": "German C1-level text...",
      "opposingView": "German C1-level text...",
      "prompt": "German C1-level critical-thinking question..."
    }
  }
}
```

For all other categories, include only the prompt per level:

```json
{
  "commentary": {
    "easy": { "prompt": "German A2-level critical-thinking question..." },
    "medium": { "prompt": "German B1-B2-level critical-thinking question..." },
    "advanced": { "prompt": "German C1-level critical-thinking question..." }
  }
}
```

The `prompt` field is an open critical-thinking prompt. Do not put Socratic or open-ended prompts in `levels.<level>.questions`.

## Sources and links

```json
{
  "sources": [
    { "name": "Reuters", "href": "https://www.reuters.com/...", "initials": "RE" }
  ],
  "relatedLinks": [
    { "name": "Background report", "href": "https://..." }
  ]
}
```

- `sources` is required and must contain at least one item.
- Each source requires `name` and absolute `href`.
- `initials` is optional.
- `relatedLinks` is optional; each item requires `name` and absolute `href`.
- Use absolute HTTPS URLs. Never use Markdown link syntax inside JSON.

## Leading image

```json
{
  "leadingImage": {
    "externalUrl": "https://...",
    "alternativeText": "Specific alt text...",
    "caption": "Optional caption",
    "credit": "Optional credit"
  }
}
```

Use `externalUrl` only when the image URL is verified and appropriate to reuse. Omit `leadingImage` if no verified image is available. Do not include a `url` field.

## Level content

Each level uses the `articleLevelContent` object:

```json
{
  "content": [],
  "questions": [],
  "vocabulary": []
}
```

**ALL THREE LEVELS (`easy`, `medium`, `advanced`) MUST include `questions` and `vocabulary`. Empty arrays are not allowed. There are no exceptions.**

Minimum per level:

| Field | Minimum |
| --- | --- |
| `content` blocks | 8, with at least 1 heading, 4 paragraphs, and 1 bullet list |
| `questions` | **4 — required for every level** |
| `vocabulary` | **6 — required for every level** |

Before emitting the final JSON, count the items in `questions` and `vocabulary` for each of the three levels. If any level is missing either array or has fewer items than the minimum, generate the missing items first.

`audio` is a file field in Sanity; omit it from generated JSON unless a Sanity file asset reference is already known.

## Question

```json
{
  "prompt": "German comprehension question...",
  "multi": false,
  "options": [
    { "label": "Antwort A", "isCorrect": true },
    { "label": "Antwort B", "isCorrect": false },
    { "label": "Antwort C", "isCorrect": false }
  ]
}
```

- Use comprehension questions only.
- Provide at least 2 options; prefer 3-4.
- Set `multi: false` unless multiple correct answers are intentional.
- For `multi: false`, exactly one option must have `"isCorrect": true`.
- **IMPORTANT: Vary the position of the correct answer.** Do not place `"isCorrect": true` on the first option by default. Distribute correct answers across all positions (first, second, third, fourth) across the set of questions.

## Vocabulary

```json
{
  "term": "die Regierung",
  "type": "Nomen",
  "question": "Welche Option passt in den Satz: Die _____ entscheidet heute.",
  "hint": "Eine Gruppe, die ein Land fuehrt.",
  "options": [
    { "label": "Regierung", "isCorrect": true, "rationale": "Richtig: Die Regierung fuehrt politische Entscheidungen aus." },
    { "label": "Wolke", "isCorrect": false, "rationale": "Falsch: Eine Wolke ist kein politisches Organ." },
    { "label": "Melodie", "isCorrect": false, "rationale": "Falsch: Eine Melodie gehoert zur Musik." },
    { "label": "Tasse", "isCorrect": false, "rationale": "Falsch: Eine Tasse ist ein Gegenstand." }
  ],
  "definition": "Eine Gruppe von Personen, die ein Land oder Gebiet leitet.",
  "example": "Die Regierung stellt einen neuen Plan vor."
}
```

- `term` is required. For German nouns, include the grammatical article.
- `type` is optional; prefer German labels such as `Nomen`, `Verb`, `Adjektiv`.
- `question` is required and must be in German. Use `_____` for fill-in-the-blank prompts.
- `hint` is optional, short, and in German.
- `options` is required and must contain exactly 4 entries.
- Every option must include `label`, `isCorrect`, and German `rationale`.
- Exactly one option must have `"isCorrect": true`.
- **IMPORTANT: Vary the position of the correct answer.** Do not place `"isCorrect": true` on the first option by default. Distribute correct answers across all positions (first, second, third, fourth) across the set of vocabulary items.
- `definition` and `example` are optional supplemental texts shown after the learner answers.

## Portable Text block format

All `content` arrays use Sanity Portable Text. Each block has `_type: "block"`.

```json
{
  "_type": "block",
  "style": "normal",
  "children": [{ "_type": "span", "text": "Paragraph text...", "marks": [] }],
  "markDefs": []
}
```

Heading:

```json
{
  "_type": "block",
  "style": "h2",
  "children": [{ "_type": "span", "text": "Heading text...", "marks": [] }],
  "markDefs": []
}
```

Unordered list item:

```json
{
  "_type": "block",
  "style": "normal",
  "listItem": "bullet",
  "level": 1,
  "children": [{ "_type": "span", "text": "Bullet text...", "marks": [] }],
  "markDefs": []
}
```

Blockquote:

```json
{
  "_type": "block",
  "style": "blockquote",
  "children": [{ "_type": "span", "text": "Quote text...", "marks": [] }],
  "markDefs": []
}
```

`markDefs` must always be present. Use `"listItem": "bullet"` on each individual bullet block; there is no wrapper list node.

## Quality rules

- Do not invent facts. Every factual claim must be supported by listed sources.
- Keep all learner-facing prose in the requested language; default German.
- Align difficulty by level: `easy` A2, `medium` B1-B2, `advanced` C1.
- Use `slug.current` with lowercase letters, digits, and hyphens only.
- Use absolute HTTPS URLs.
- Omit fields that require unknown Sanity references.
