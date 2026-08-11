# Prompts

The single source of truth for editorial prose. The news desk has two execution paths —
the LangGraph pipeline and the Agent Skills in [`skills/`](../skills/) — and both are
composed from the fragments here, so a journalist's voice is defined exactly once.

```
prompts/
  <journalist-id>/persona.md   voice, inspirations, profile
  <journalist-id>/beat.md      role, editorial range, geography, category and field rules
  <journalist-id>/research.md  what story to look for, preferred sources, verification bar
  _shared/                     fragments used by every journalist
  skills/<skill-dir>.md        SKILL.md templates (frontmatter + workflow + placeholders)
```

## Who consumes what

| Output | Composed from |
| --- | --- |
| `pitchSystemPrompt` (graph) | `persona` + `beat` + `research` + `_shared/graph-pitch-task.md` |
| `articleSystemPrompt` (graph) | `persona` + `beat` + `_shared/graph-article-task.md` |
| `skills/<skill-dir>/SKILL.md` | `skills/<skill-dir>.md` template + `persona` + `beat` + `research` + `_shared/skill-full-article-mode.md` |

The graph composes at import time in [`src/personas.ts`](../src/personas.ts). The skills are
**generated files** — they are copied into `.claude/skills/` to be used, so they have to be
self-contained rather than reading `prompts/` at runtime:

```bash
npm run build:skills   # regenerate skills/*/SKILL.md
npm run check:skills   # exit 1 if any checked-in SKILL.md is stale
```

Never edit `skills/*/SKILL.md` by hand — edit the fragment or the template and rebuild.
`news-generator` is hand-written and not generated.

## Placeholders

Templates and shared fragments support `{{...}}`, substituted at render time. An unknown
placeholder or a missing file throws rather than silently producing a broken prompt.

| Placeholder | Where | Value |
| --- | --- | --- |
| `{{persona}}` `{{beat}}` `{{research}}` | skill templates | the journalist's fragments |
| `{{fullArticleMode}}` | skill templates | rendered `_shared/skill-full-article-mode.md` |
| `{{roster}}` `{{skillPaths}}` | editor skill template | derived from `JOURNALIST_PROFILES` |
| `{{agentRef}}` | article fragments | the journalist's Sanity agent document id |
| `{{articleSchemaRules}}` | article fragments | `_shared/article-schema-rules.md` |
| `{{politicalFieldsRule}}` | `skill-full-article-mode.md` | derived from `isPolitical` |

## Adding a journalist

1. Add the id to `JournalistId` and `ALL_JOURNALIST_IDS` in [`src/types.ts`](../src/types.ts).
2. Add a profile to `JOURNALIST_PROFILES` in [`src/personas.ts`](../src/personas.ts), including
   `agentRef`, `skillDir`, `shortLabel`, and `beatSummary`.
3. Write `prompts/<journalist-id>/persona.md`, `beat.md`, and `research.md`.
4. Write `prompts/skills/<skill-dir>.md` (copy an existing template).
5. Run `npm run build:skills`.

The graph picks the journalist up automatically — the pitch fan-out maps over
`ALL_JOURNALIST_IDS`. The editor skill's roster regenerates from the profile.
