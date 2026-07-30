# Umbruch AI News Desk Architecture

This app is a LangGraph-based multi-agent news desk for generating and publishing German-language news articles for Umbruch AI. It does create different journalist agents, but they are not long-lived service objects. They are runtime LLM agents created from journalist personas during each graph run.

## Short Answer

Yes. The app creates a separate journalist agent for each configured journalist during the pitch phase.

The journalists are defined in `src/personas.ts` and enumerated in `src/types.ts`:

- `left-wing`: George Bourdieu
- `right-wing`: William F. Brooks
- `culture-society-history`: Hannah Benjamin
- `health`: Carl Frankl
- `science-technology`: Isaac Sagan

At runtime, LangGraph fans out from `START` to one `pitchJournalist` branch per journalist ID. Each branch sets `activeJournalistId`, loads that persona, creates a LangChain agent with that persona's pitch prompt, lets it research with OpenAI's hosted web search tool, and captures one structured pitch through a `submit_pitch` tool.

The full article generation phase does not use `createAgent`; it uses a direct chat model call with the selected journalist's article prompt and the article schema reference.

## Main Files

| File | Purpose |
| --- | --- |
| `src/graph/index.ts` | Builds and compiles the LangGraph workflow. |
| `src/graph/state.ts` | Defines graph state, reducers, and defaults. |
| `src/graph/nodes.ts` | Implements pitch, human selection, article generation, validation, publishing, and final summary nodes. |
| `src/personas.ts` | Defines journalist identities, domains, prompts, and Sanity author references. |
| `src/types.ts` | Defines journalist IDs, pitch shape, and post result shape. |
| `src/tools/search.ts` | Creates OpenAI hosted web search tools for model calls. |
| `src/tools/postArticle.ts` | Uploads approved images, generates audio, uploads audio files to Sanity, and posts article mutations. |
| `src/schema.ts` | Contains the article JSON schema reference given to the LLM. |
| `langgraph.json` | Registers the graph as `news_desk` for LangGraph CLI/Studio. |

## Graph Flow

The graph is built in `src/graph/index.ts`.

```text
START
  |
  | fan out to every journalist ID
  v
pitchJournalist
  |
  | pitches are merged into state.pitches
  v
presentPitches
  |
  | human interrupt: editor selects articles
  v
generateArticle
  |
  | selected article objects are merged into state.articles
  v
validateAndFixArticle
  |
  | corrected article objects overwrite state.articles entries
  v
generateArticleImage ◄──────────────────────────────┐
  |                                                  |
  | generated image data URL stored in state.pendingImages
  v                                                  |
reviewArticleImage                                   |
  |                                                  |
  | human interrupt: editor approves or rejects      |
  |                                                  |
  ├── "ok" → approved image data URL → state.approvedImages
  |                                                  |
  └── custom prompt → state.imageCustomPrompts ──────┘
      (loops back to regenerate for that article)
  |
  | (all articles approved)
  v
postAllArticles  (uploads approved data URLs, injects leadingImage before posting)
  |
  | posting results are appended to state.postResults
  v
finalNote
  |
  v
END
```

There are two fan-out points:

1. `kickoffPitching()` sends one branch to `pitchJournalist` for every ID in `ALL_JOURNALIST_IDS`.
2. `kickoffGeneration()` sends one branch to `generateArticle` for every ID selected by the editor.

The reducers in `src/graph/state.ts` merge these branch outputs back into shared state.

## State Model

The graph state is defined with `Annotation.Root` in `src/graph/state.ts`.

| State field | Meaning | Reducer behavior |
| --- | --- | --- |
| `date` | Date used in prompts. Defaults to today's ISO date. | Replaced by latest update. |
| `activeJournalistId` | Current branch's journalist ID. | Replaced by latest branch update. |
| `pitches` | Map of journalist ID to submitted pitch. | Object merge. |
| `selectedIds` | Journalist IDs chosen by the editor after pitch review. | Replaced by latest update. |
| `articles` | Map of journalist ID to generated article JSON object. | Object merge. |
| `pendingImages` | Map of journalist ID to generated base64 image data URL awaiting review. | Replaced entirely (enables deletion). |
| `approvedImages` | Map of journalist ID to editor-approved image data URL or uploaded CDN URL. | Object merge (accumulates). |
| `imageCustomPrompts` | Map of journalist ID to a user-supplied regeneration prompt. | Replaced entirely (enables deletion). |
| `postResults` | Results from posting generated articles. | Array append. |

`activeJournalistId` is effectively branch-local because it is supplied through `Send`. The persistent cross-branch data is held in `pitches`, `articles`, and `postResults`.

## Phase 1: Pitching

Implemented by `pitchJournalist()` in `src/graph/nodes.ts`.

For each journalist:

1. The graph branch receives an `activeJournalistId`.
2. The node loads the matching persona from `JOURNALIST_PERSONAS`.
3. It creates a local `submit_pitch` tool with a Zod schema.
4. It creates a LangChain agent with:
   - model: `ChatOpenAI`
   - model name: configured in `src/graph/nodes.ts`
   - tools: OpenAI hosted web search plus `submit_pitch`
   - system prompt: the persona's `pitchSystemPrompt`
5. The agent is asked to find one real story from today or the last 24 hours, verify it with at least three sources, and call `submit_pitch`.
6. The captured pitch is returned into graph state as:

```ts
{
  pitches: {
    [journalistId]: pitch
  }
}
```

If the agent never calls `submit_pitch`, the app creates a fallback pitch with `No story found`.

## Phase 2: Editorial Selection

Implemented by `presentPitches()` in `src/graph/nodes.ts`.

This node formats all submitted pitches and then calls LangGraph `interrupt()`. The interrupt pauses the graph so a human editor can choose which articles to generate.

The editor can enter:

- `all`
- exact journalist IDs like `health` or `science-technology`

The interrupt prompt includes the currently available journalist IDs, so the editor does not need to remember them. IDs can be comma-separated or whitespace-separated, for example `health science-technology` or `health,science-technology`. Numeric selections and partial prefixes are not accepted.

The selected IDs are stored in `state.selectedIds`.

If no IDs are selected, `kickoffGeneration()` routes directly to `finalNote`.

## Phase 3: Article Generation

Implemented by `generateArticle()` in `src/graph/nodes.ts`.

For each selected journalist:

1. The node gets the selected pitch and persona.
2. It builds a prompt containing the pitch details, sources, article schema reference, current date, and journalist article prompt.
3. It asks the model to use OpenAI hosted web search during the article-generation call to verify current facts and source context.
4. It calls `ChatOpenAI` directly.
5. It extracts JSON from the response.
6. It validates that the JSON is parseable.
7. It returns the parsed object directly into graph state — no file is written to disk.

The node returns:

```ts
{
  articles: {
    [journalistId]: parsedArticleObject
  }
}
```

The generated article is expected to be a Sanity mutation payload for an `article` document with German `easy`, `medium`, and `advanced` levels.

## Phase 3.7: Illustration Generation & Review

Implemented by `generateArticleImage()` and `reviewArticleImage()` in `src/graph/nodes.ts`.

Runs sequentially (one article at a time) after all validation branches complete, before posting.

### `generateArticleImage`

1. Finds the first article in `state.articles` that does not yet have an entry in `state.approvedImages`.
2. If `state.imageCustomPrompts` has an entry for that journalist, uses it as the image prompt; otherwise sends the article title, category, and summary to `gpt-4.1-mini` to craft a short New Yorker magazine-style illustration prompt.
3. Calls the OpenAI images API with `gpt-image-2`, `1536x1024`, and low quality.
4. Stores the resulting base64 PNG data URL in `state.pendingImages[journalistId]`.
5. Clears the consumed custom prompt from `state.imageCustomPrompts`.

### `reviewArticleImage`

1. Reads the first entry in `state.pendingImages`.
2. Calls `interrupt()` showing the article title and generated image to the editor.
3. Editor responds:
   - `"ok"` / `"okay"` / `"yes"` → image data URL is moved to `state.approvedImages[journalistId]`.
   - Any other text → treated as a custom prompt; stored in `state.imageCustomPrompts[journalistId]`; routing sends the graph back to `generateArticleImage`.
4. The processed entry is always removed from `state.pendingImages`.

### Routing

`routeAfterImageReview()` checks whether every journalist ID in `state.articles` has an entry in `state.approvedImages`:
- Any unapproved → `generateArticleImage` (next article, or regeneration of a rejected one).
- All approved → `postAllArticles`.

## Phase 4: Posting, Image Upload, and Audio

Implemented by `postAllArticles()` in `src/graph/nodes.ts` and `postArticleWithAudio()` in `src/tools/postArticle.ts`.

For each generated article object (passed directly from `state.articles` — no disk read required):

1. The object is normalized as a Sanity mutation payload.
2. If the approved image is still a base64 data URL, it is uploaded to Sanity and replaced with the returned CDN URL.
3. The approved image URL is injected into the article document as `leadingImage`.
4. The article slug is read from `slug.current`.
5. Speakable text is extracted from each level's Portable Text blocks.
6. OpenAI text-to-speech generates three MP3 buffers in memory (one per level).
7. Each buffer is uploaded to Sanity as a file asset — no MP3 is written to disk.
8. The Sanity asset references are attached back to the article document under each level's `audio` field.
9. The final mutation is posted to Sanity.

Posting is handled sequentially inside `postAllArticles()`, even if multiple articles were generated in parallel.

## Environment Variables

Required:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | `nodes.ts`, `postArticle.ts` | Chat model calls, image generation, and text-to-speech. |
| `SANITY_API_TOKEN` | `postArticle.ts` | Upload image/audio assets and post mutations. |

Optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SANITY_PROJECT_ID` | `nws8g1b1` | Sanity project ID. |
| `SANITY_DATASET` | `production` | Sanity dataset. |
| `SANITY_API_VERSION` | `2025-02-19` | Sanity API version. |
| `OPENAI_TTS_MODEL` | `tts-1` | Text-to-speech model. |
| `OPENAI_TTS_VOICE` | `alloy` | Text-to-speech voice. |
| `OPENAI_TTS_SPEED` | `1` | Text-to-speech speed. |

`langgraph.json` points the LangGraph runtime at `.env`.

## Journalist Personas

Each persona in `src/personas.ts` includes:

- `id`: one of the `JournalistId` union values
- `displayName`: editor-facing label
- `emoji`: console/display marker
- `characterName`: author name
- `categories`: allowed subject domains
- `isPolitical`: whether political fields are expected
- `pitchSystemPrompt`: used by the pitch agent
- `articleSystemPrompt`: used by article generation

Political journalists include `leaning`, `agencyLevel`, `humanConcern`, and `opposingView`. Non-political journalists omit those fields.

Each article prompt also hard-codes the corresponding `agents` Sanity author reference.

## How To Add A Journalist

To add another journalist, update all of these places:

1. Add a new ID to the `JournalistId` union in `src/types.ts`.
2. Add that ID to `ALL_JOURNALIST_IDS` in `src/types.ts`.
3. Add a matching entry to `JOURNALIST_PERSONAS` in `src/personas.ts`.
4. Make sure the persona's `articleSystemPrompt` includes the correct Sanity `agents` reference.
5. Confirm the prompt's category rules match the allowed category values in `src/schema.ts`.

After that, the graph will automatically include the new journalist in the pitch fan-out because `kickoffPitching()` maps over `ALL_JOURNALIST_IDS`.

## Important Behavior Notes

- The app creates pitch agents dynamically per graph branch. It does not maintain persistent agent instances.
- Pitching is tool-driven. The pitch must be captured through the `submit_pitch` tool.
- Article generation is schema-driven. The LLM is asked to return only valid JSON.
- `extractJson()` tolerates markdown fences or surrounding text, but final parsing still requires valid JSON.
- Web research uses OpenAI hosted web search through `@langchain/openai`; no separate search-provider API key is required.
- Posting mutates external systems: it uploads approved images, generates audio buffers, uploads audio assets to Sanity, and posts Sanity mutations.
- The graph uses `MemorySaver` as its checkpointer, which is appropriate for local/dev runs but not durable long-term storage.

## Phase 3.5: Validation & Correction

Implemented by `validateAndFixArticle()` in `src/graph/nodes.ts`.

Runs in parallel per selected journalist, between `generateArticle` and image generation.

For each generated article:

1. The node reads the article from `state.articles[activeJournalistId]`.
2. It creates a `submit_validated_article` tool to capture the corrected JSON.
3. It creates a LangChain agent with a detailed validation system prompt.
4. The agent checks and fixes:
   - **German character encoding**: corrects ASCII substitutions (oe→ö, ae→ä, ue→ü, ss→ß) across all text fields using language context (foreign names and loanwords are left unchanged).
   - **Missing required fields**: adds sensible defaults for any field required by the schema.
   - **Schema violations**: removes leaning/agencyLevel/humanConcern/opposingView from non-political articles, ensures correct Portable Text block structure, fixes question and vocabulary option counts.
5. The agent calls `submit_validated_article` with the corrected JSON and a list of issues found.
6. The corrected article is written back to `state.articles`, overwriting the original.
7. If the agent fails to submit, the original article is kept and a warning is logged — posting is not blocked.

## Current Limitations And Risks

- The pitch sources are requested in the prompt, but source quality still depends on the LLM and search results.
- If an article contains no speakable Portable Text content for any level, posting fails before mutation.
- Publishing is coupled to article generation: once selected articles are generated, `postAllArticles()` attempts to generate audio and publish them.
- The code currently uses `ChatOpenAI`; Anthropic call sites are present only as commented examples.
