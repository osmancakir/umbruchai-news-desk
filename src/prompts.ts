import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * All editorial prose lives in /prompts as markdown fragments, so it can be
 * edited without touching code. Two consumers compose those fragments:
 * `src/personas.ts` (the LangGraph system prompts) and
 * `src/scripts/build-skills.ts` (the Agent Skills under /skills).
 *
 * Resolved relative to this module, so it works from src/ (tsx) and dist/ alike.
 */
export const PROMPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'prompts')

/** Reads a prompt fragment, trimmed. Throws with the full path if it is missing. */
export function readPrompt(relativePath: string): string {
  const fullPath = join(PROMPTS_DIR, relativePath)
  try {
    return readFileSync(fullPath, 'utf8').trim()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Could not read prompt file ${fullPath}: ${message}`)
  }
}

/** Substitutes every {{placeholder}} from `vars`. Unknown placeholders throw. */
export function render(template: string, vars: Record<string, string>, source: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key]
    if (value === undefined) {
      throw new Error(`Unknown placeholder {{${key}}} in ${source}`)
    }
    return value
  })
}

/** Reads a prompt fragment and substitutes its placeholders. */
export function renderPrompt(relativePath: string, vars: Record<string, string>): string {
  return render(readPrompt(relativePath), vars, relativePath)
}

/** Joins fragments into one document, separated by blank lines. */
export function joinSections(...sections: string[]): string {
  return sections.filter(Boolean).join('\n\n')
}

/** Shared schema rules injected into every article-writing prompt. */
export const ARTICLE_SCHEMA_RULES = readPrompt('_shared/article-schema-rules.md')
