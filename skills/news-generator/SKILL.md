---
name: news-generator
description: >
  Generates a fully-structured Library Universe article JSON payload for German-language news and learning content,
  and can generate per-level text-to-speech audio files and post the finished article to Library Universe/Sanity.
  Use this skill whenever the user asks to generate a news article, create an article JSON, create news content,
  publish or post a generated article, create article TTS audio, or provides a supported article category such as
  politics-economics, culture, health, history, philosophy, science, society, sports, technology, or environment.
  For politics-economics articles, support political leaning and agencyLevel fields; for all other categories,
  omit leaning and agencyLevel. Always use this skill instead of generating the JSON freehand.
---

# News Generator Skill

Generate a real, sourced, multilevel German-language `article` document JSON for the Library Universe app.

## Inputs

- **category**: one of `politics-economics`, `culture`, `health`, `history`, `philosophy`, `science`, `society`, `sports`, `technology`, `environment`.
- **leaning**: only valid for `politics-economics`; use one of `left`, `center-left`, `center-right`, `right`, `neutral`.
- **agencyLevel**: only valid for `politics-economics`; use one of `paralyzing`, `concerning`, `neutral`, `hopeful`, `empowering`.
- **region** *(optional)*: one of `global`, `africa`, `asia`, `europe`, `latin-america`, `middle-east`, `north-america`, `oceania`.
- **language** *(optional)*: default to `german` unless the user explicitly requests `english`, `irish`, or `turkish`.

If `category` is missing, ask for it. If `category` is `politics-economics` and `leaning` is missing, ask for it. Do not ask for `leaning` or `agencyLevel` for other categories; omit those fields even if the user mentions them unless they change the category.

## Workflow

### 1. Find a real story

Use web search to find one real news story published today or within the last 24 hours that fits the requested category. For `politics-economics`, choose source framing that matches the requested `leaning`; if the user specified `agencyLevel`, actively search for a story that fits that emotional framing.

Verify facts with at least 3 reputable sources. Collect each source's name and URL for `sources`.

Prefer these source families:

- `politics-economics`, right or center-right: Welt, FAZ, Focus, NZZ, Wall Street Journal, The Telegraph, Fox News.
- `politics-economics`, left or center-left: taz, Der Spiegel, Guardian, Le Monde, New York Times, MSNBC.
- `politics-economics`, neutral: Reuters, AP, BBC, DW, Zeit Online, Suddeutsche Zeitung.
- Non-political categories: Reuters, AP, BBC, DW, Zeit Online, Suddeutsche Zeitung, Nature, Science, Scientific American, official institutional sources.

Exclude stories that are purely dehumanizing with no legitimate underlying concern.

### 2. Apply the editorial philosophy

For every article:

1. Reframe neutrally; replace loaded framing with precise, descriptive language.
2. Avoid presenting any group as monolithic.
3. Add one open critical-thinking prompt per level in `commentary.<level>.prompt`.

For `politics-economics` only:

1. Include top-level `leaning` and `agencyLevel`.
2. Include `commentary.<level>.humanConcern`: 1-2 German sentences naming the fear, value, or lived experience behind the framing.
3. Include `commentary.<level>.opposingView`: 1-3 German sentences steelmanning the position the source framing does not represent.

For all other categories, omit top-level `leaning`, omit top-level `agencyLevel`, and omit `humanConcern` and `opposingView`.

### 3. Write the JSON payload

Follow `references/schema.md` exactly. Key rules:

- Return only valid JSON: no markdown fences, comments, or preamble.
- Wrap the document in a Sanity mutations envelope: `{ "mutations": [{ "create": { ... } }] }`.
- Use `_type: "article"`, not `news`.
- Use string fields for `category` and `language`, not references.
- Use `language: "german"` for German articles.
- Do not include removed fields such as `readingTime`, `editorial`, or `crosswordMeta`.
- Include all three levels: `easy` (A2), `medium` (B1-B2), `advanced` (C1).
- Per level minimum: 8 content blocks, including at least 1 heading, 4 paragraphs, and 1 bullet list; 4 comprehension questions; 6 vocabulary items.
- Questions: comprehension only, at least 2 options, usually 3-4, exactly 1 option with `"isCorrect": true` unless `multi: true` is explicitly warranted.
- Vocabulary items: use `term`, optional `type`, `question`, optional `hint`, `options`, optional `definition`, optional `example`.
- Vocabulary options: exactly 4 entries with `label`, `isCorrect`, and `rationale`; exactly 1 option has `"isCorrect": true`.
- Write vocabulary `question`, `hint`, and every `rationale` in German. For fill-in-the-blank prompts, use `_____`.
- Include grammatical articles in German noun `term` values, e.g. `"die Regierung"`.
- Use `slug.current` in lowercase with hyphens only.
- Use ISO 8601 for `date`.
- Include `sources` with at least one item; prefer all verification sources.
- Include `leadingImage.externalUrl` only for a verified image URL. Otherwise omit `leadingImage`.
- Include `aiAuthor` with one model object using role `"author"`.

Read `references/schema.md` for the complete shape and Portable Text block examples before writing.

**MANDATORY SELF-CHECK before outputting JSON:** Verify that ALL THREE levels (`easy`, `medium`, `advanced`) each contain:
- `questions` array with at least 4 items — no exceptions, no empty arrays
- `vocabulary` array with at least 6 items — no exceptions, no empty arrays
- `content` array with at least 8 blocks (≥1 heading h2, ≥4 paragraphs, ≥1 bullet list)

If any level is missing `questions` or `vocabulary`, generate them before outputting. **Never output a levels object with an empty or missing questions or vocabulary array.**

### 4. Save, generate audio, and post

Validate that the JSON is well-formed and complete. Save to the path requested by the user; if no path is requested, provide the JSON directly or save it in the current working directory using `<slug>.json`.

Unless the user explicitly asks for JSON-only output, run the bundled Node script after saving the mutation file:

```bash
node .claude/skills/news-generator/scripts/post_article_with_audio.mjs --article <path-to-json> --post
```

The script converts `levels.easy.content`, `levels.medium.content`, and `levels.advanced.content` to speech text, creates `news/audios/<slug>_<level>.mp3`, uploads those files as Sanity file assets, attaches each asset to `levels.<level>.audio`, writes `<slug>.with-audio.json`, and posts the enriched mutation to Library Universe/Sanity.

Requirements:

- `OPENAI_API_KEY` for text-to-speech.
- `SANITY_API_TOKEN` for audio asset upload and mutation posting.
- Default Sanity target: project `vm3u26ik`, dataset `production`, API version `2025-02-19`; override with script flags only when the user asks.

Use `--dry-run` only to validate the script against a JSON file without OpenAI or Sanity calls. Use `--upload` instead of `--post` only when the user wants assets uploaded and an enriched mutation file written without publishing the document.

Summarize the result in 2-3 sentences: what the story is, which category it uses, and, for `politics-economics`, the source leaning and `agencyLevel`.
