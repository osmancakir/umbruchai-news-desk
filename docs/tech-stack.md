# Umbruch AI Agents Tech Stack Summary

## Executive Summary

This app is a TypeScript-based, agentic content production pipeline for Umbruch AI. It uses LangGraph to coordinate multiple AI journalist personas that research current stories, pitch article ideas, generate German learning articles, validate the output, create editorial illustrations, generate audio, and publish the final content to Sanity.

It is best described as an AI-assisted editorial backend, not a traditional web frontend. The main value of the stack is orchestration: it connects LLM reasoning, human editorial checkpoints, schema validation, media generation, and CMS publishing into one workflow.

## Stack At A Glance

| Layer | Technology | Role |
| --- | --- | --- |
| Runtime | Node.js 20 | JavaScript runtime for the LangGraph app |
| Language | TypeScript 5.8, ES modules | Strict typed implementation across the graph, state, tools, and personas |
| Agent orchestration | LangGraph JS 1.3.6 | Multi-step workflow, branching, fan-out/fan-in, state reducers, human interrupts |
| LLM framework | LangChain 1.4, LangChain Core, LangChain OpenAI | Chat model calls, tool calling, agent creation, OpenAI hosted web search |
| AI models | OpenAI chat, image, and text-to-speech models | Research, article generation, validation, illustration prompt writing, image generation, audio generation |
| Tool schemas | Zod | Structured pitch and validation tool contracts |
| CMS | Sanity Content Lake | Stores article documents, leading images, and generated audio file assets |
| Content format | Sanity mutation JSON and Portable Text | Article payload format used by the publishing pipeline |
| Configuration | `langgraph.json`, `.env`, `package.json`, `tsconfig.json` | Runtime graph registration, secrets, dependencies, TypeScript settings |

## What The App Does

The app runs a newsroom-style workflow:

1. Five AI journalist personas research possible stories.
2. Each persona submits a structured pitch.
3. A human editor selects which pitches should become articles.
4. Selected articles are generated in German with three reading levels: `easy`, `medium`, and `advanced`.
5. A validator agent checks and repairs schema issues, missing learning content, and German character problems.
6. The app generates an editorial illustration for each article.
7. A human editor approves the image or provides a custom regeneration prompt.
8. The app uploads images and generated audio to Sanity.
9. The final Sanity article mutation is posted to the Umbruch AI content backend.

## Core Architecture

The workflow is defined in `src/graph/index.ts` as a LangGraph state machine. The graph uses parallel branches for the research and article-generation phases, then switches to sequential review and publishing steps where human approval or external uploads are involved.

```text
START
  -> pitchJournalist, one branch per persona
  -> presentPitches, human editor selection
  -> generateArticle, one branch per selected article
  -> validateAndFixArticle
  -> generateArticleImage
  -> reviewArticleImage, human image approval
  -> postAllArticles
  -> finalNote
  -> END
```

State is centralized in `src/graph/state.ts`. LangGraph reducers merge parallel branch outputs, such as pitches and generated articles, back into shared workflow state.

## Agent And AI Layer

The app uses LangChain and OpenAI through `ChatOpenAI`.

Configured model usage in the code:

| Purpose | Configured model |
| --- | --- |
| Pitch research and article generation | `gpt-5.4-2026-03-05` |
| Article validation and repair | `gpt-4.1-mini` |
| Illustration prompt creation | `gpt-5.4-mini` |
| Image generation | `gpt-image-2` |
| Text-to-speech | `tts-1` by default, configurable |

The app also includes `@langchain/anthropic`, and some Anthropic code paths are present as comments, but the active implementation uses OpenAI.

OpenAI hosted web search is wrapped in `src/tools/search.ts` and used during pitching and article generation so stories can be grounded in current sources.

## Journalist Persona System

The journalist system lives in `src/personas.ts`, `prompts/`, and `src/types.ts`, and is shared with the Agent Skills in `skills/`.

The configured personas are:

| Journalist ID | Persona | Focus |
| --- | --- | --- |
| `left-wing` | George Bourdieu | Left or center-left politics and economics |
| `right-wing` | William F. Brooks | Right or center-right politics and economics |
| `culture-society-history` | Hannah Benjamin | Culture, society, history, philosophy |
| `health` | Carl Frankl | Health, wellbeing, parenting, aging |
| `science-technology` | Isaac Sagan | Science, technology, environment |

Each persona has its own prose, allowed categories, and Sanity author reference. The prose lives as markdown fragments under `prompts/<journalist-id>/` (`persona.md`, `beat.md`, `research.md`), so editorial voice is edited as content rather than as TypeScript string literals.

Those fragments are the single source of truth for both execution paths. `src/personas.ts` composes them into the graph's pitch and article system prompts at startup, and `src/scripts/build-skills.ts` generates the Agent Skills in `skills/` from the same fragments (`npm run build:skills`, verified by `npm run check:skills`). Previously the same persona prose was maintained separately in both places and could drift.

This makes the system extensible: adding a new journalist mostly means adding a profile, three prompt fragments, a skill template, and extending the journalist ID list.

## Content And Schema Strategy

The app generates Sanity mutation JSON for article documents. The expected article shape is described in `src/schema.ts`.

Key content requirements:

- Articles are written in German.
- Every article has three levels: `easy`, `medium`, and `advanced`.
- Each level includes content blocks, comprehension questions, and vocabulary exercises.
- Content uses Sanity Portable Text blocks.
- Politics/economics articles can include political fields like `leaning`, `agencyLevel`, `humanConcern`, and `opposingView`.
- Non-political categories must omit those political fields.
- Sources are included as absolute URLs.

The validation stage in `src/graph/nodes.ts` performs an LLM-powered repair pass after initial article generation. It checks for missing levels, insufficient questions or vocabulary, invalid schema details, and German character corrections.

## Sanity Publishing Layer

Sanity integration is implemented in `src/tools/postArticle.ts` using direct HTTP `fetch` calls rather than a Sanity client library.

The publishing pipeline:

1. Normalizes generated article JSON into a Sanity mutation payload.
2. Uploads the approved base64 illustration to Sanity as an image asset.
3. Injects the image asset reference into `leadingImage`.
4. Extracts speakable text from the article's Portable Text blocks.
5. Generates MP3 audio for each reading level.
6. Uploads audio files to Sanity as file assets.
7. Attaches audio references to each article level.
8. Posts the final article mutation to Sanity.

The upload layer includes retry and timeout handling for OpenAI and Sanity network calls.

## Human-In-The-Loop Design

Human review is built directly into the graph through LangGraph `interrupt()` calls.

There are two key editorial checkpoints:

- Pitch selection: the editor chooses which journalist pitches should become articles.
- Image review: the editor approves generated illustrations or enters a custom prompt to regenerate them.

This keeps the workflow automated where automation is useful, while preserving editorial control over story selection and visual publishing.

## Configuration And Runtime

The graph is registered in `langgraph.json`:

```json
{
  "node_version": "20",
  "graphs": {
    "news_desk": "./src/graph/index.ts:graph"
  },
  "env": ".env"
}
```

Available npm scripts:

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `langgraphjs dev` | Runs LangGraph development mode |
| `npm run start` | `langgraphjs dev` | Same runtime command |
| `npm run studio` | `langgraphjs dev` | Same runtime command for Studio usage |

Important environment variables:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI chat, search, image, and TTS calls |
| `SANITY_API_TOKEN` | Sanity asset uploads and mutation posting |
| `SANITY_PROJECT_ID` | Sanity project ID, defaults in code |
| `SANITY_DATASET` | Sanity dataset, defaults to `production` |
| `SANITY_API_VERSION` | Sanity API version |
| `OPENAI_TTS_MODEL` | Optional TTS model override |
| `OPENAI_TTS_VOICE` | Optional TTS voice override |
| `OPENAI_TTS_SPEED` | Optional TTS speed override |

## Engineering Characteristics

Strengths:

- Typed TypeScript codebase with strict compiler settings.
- Explicit graph workflow instead of ad hoc script sequencing.
- Parallel fan-out for independent research and article generation.
- Human approval points for editorial decisions.
- Structured tool contracts with Zod.
- Schema-oriented article generation and a separate validation/repair pass.
- Direct CMS publishing with media asset upload.
- Retry and timeout handling around external API calls.

Tradeoffs and current limitations:

- The graph uses LangGraph `MemorySaver`, so checkpointing is in-memory rather than persistent.
- There are no test or lint scripts defined in `package.json`.
- Sanity integration is implemented with direct REST calls, which is simple and transparent but lower-level than a dedicated Sanity client.
- The workflow depends heavily on external network APIs: OpenAI for reasoning/media and Sanity for publishing.
- Several model names are hard-coded in `src/graph/nodes.ts`; moving them into environment variables would make presentation demos and production changes easier.

## Presentation Talking Points

- "This is an agentic editorial backend for Umbruch AI, built around LangGraph rather than a conventional request-response server."
- "The system uses multiple AI journalist personas, each with a distinct editorial domain and writing style."
- "LangGraph gives us a clear workflow: research, pitch, human selection, article generation, validation, image approval, audio generation, and CMS publishing."
- "The human editor stays in control at the two highest-impact moments: story selection and image approval."
- "The output is not just text. The pipeline produces structured Sanity articles, educational exercises, images, and level-specific audio."
- "The stack is intentionally small: Node, TypeScript, LangGraph, LangChain, OpenAI, Zod, and Sanity."

## Source Map

| File | Why it matters |
| --- | --- |
| `package.json` | Dependency and script overview |
| `langgraph.json` | LangGraph runtime registration |
| `tsconfig.json` | TypeScript compiler configuration |
| `src/graph/index.ts` | Main graph structure |
| `src/graph/state.ts` | Workflow state and reducers |
| `src/graph/nodes.ts` | Main workflow implementation |
| `src/personas.ts` | Journalist profiles, author mapping, and prompt composition |
| `src/prompts.ts` | Prompt fragment loading and placeholder rendering |
| `src/scripts/build-skills.ts` | Generates `skills/*/SKILL.md` from `prompts/` |
| `prompts/` | Single source of truth for persona prose, shared by graph and skills |
| `src/types.ts` | Shared TypeScript types |
| `src/schema.ts` | Article schema reference given to the LLM |
| `src/tools/search.ts` | OpenAI web search tool wrapper |
| `src/tools/postArticle.ts` | Sanity publishing, image upload, and audio generation |
