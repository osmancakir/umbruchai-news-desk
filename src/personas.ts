import { join } from 'node:path'
import type { JournalistId } from './types.js'
import { JOURNALIST_PROFILES, type JournalistProfile } from './journalistProfiles.js'
import { ARTICLE_SCHEMA_RULES, joinSections, readPrompt, renderPrompt } from './prompts.js'

export { JOURNALIST_PROFILES, type JournalistProfile }

export interface JournalistPersona extends JournalistProfile {
  pitchSystemPrompt: string
  articleSystemPrompt: string
}

/** The three per-journalist prose fragments, shared with the Agent Skills. */
export function readJournalistFragments(profile: JournalistProfile) {
  return {
    persona: readPrompt(join(profile.id, 'persona.md')),
    beat: readPrompt(join(profile.id, 'beat.md')),
    research: readPrompt(join(profile.id, 'research.md')),
  }
}

function loadPersona(profile: JournalistProfile): JournalistPersona {
  const { persona, beat, research } = readJournalistFragments(profile)
  const vars = {
    agentRef: profile.agentRef,
    articleSchemaRules: ARTICLE_SCHEMA_RULES,
    characterName: profile.characterName,
  }

  return {
    ...profile,
    pitchSystemPrompt: joinSections(
      '## Voice & Persona',
      persona,
      '## Your Beat',
      beat,
      "## Finding Today's Story",
      research,
      '## Your Task Now',
      renderPrompt('_shared/graph-pitch-task.md', vars),
    ),
    articleSystemPrompt: joinSections(
      '## Voice & Persona',
      persona,
      '## Your Beat',
      beat,
      '## Your Task Now',
      renderPrompt('_shared/graph-article-task.md', vars),
    ),
  }
}

// Loaded once at import time: a missing or malformed prompt file fails fast
// on startup instead of mid-run, after the model calls have already been paid for.
export const JOURNALIST_PERSONAS: Record<JournalistId, JournalistPersona> = Object.fromEntries(
  Object.entries(JOURNALIST_PROFILES).map(([id, profile]) => [id, loadPersona(profile)]),
) as Record<JournalistId, JournalistPersona>
