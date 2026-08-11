import { join } from 'node:path'
import type { JournalistId } from './types.js'
import { ARTICLE_SCHEMA_RULES, joinSections, readPrompt, renderPrompt } from './prompts.js'

export interface JournalistPersona {
  id: JournalistId
  displayName: string
  emoji: string
  characterName: string
  categories: string[]
  isPolitical: boolean
  /** Sanity document id of this journalist's author/agent document. */
  agentRef: string
  /** Directory name of the matching Agent Skill under /skills. */
  skillDir: string
  /** Short label used in the editor skill's agent-path list. */
  shortLabel: string
  /** One-line beat description used in the editor skill's roster. */
  beatSummary: string
  pitchSystemPrompt: string
  articleSystemPrompt: string
}

/** Everything about a journalist that is data rather than prose. */
export type JournalistProfile = Omit<JournalistPersona, 'pitchSystemPrompt' | 'articleSystemPrompt'>

export const JOURNALIST_PROFILES: Record<JournalistId, JournalistProfile> = {
  'left-wing': {
    id: 'left-wing',
    displayName: 'LEFT-WING JOURNALIST',
    emoji: '🔴',
    characterName: 'George Bourdieu',
    categories: ['politics-economics'],
    isPolitical: true,
    agentRef: '66e48be4-e8ca-4639-a529-2ee6d57cba83',
    skillDir: 'left-wing-journalist-agent',
    shortLabel: 'Left-wing journalist',
    beatSummary: 'left or center-left politics/economics.',
  },

  'right-wing': {
    id: 'right-wing',
    displayName: 'RIGHT-WING JOURNALIST',
    emoji: '🔵',
    characterName: 'William F. Brooks',
    categories: ['politics-economics'],
    isPolitical: true,
    agentRef: '29f5a470-9167-41ed-b267-5e616d2f1b5f',
    skillDir: 'right-wing-journalist-agent',
    shortLabel: 'Right-wing journalist',
    beatSummary: 'right or center-right politics/economics.',
  },

  'culture-society-history': {
    id: 'culture-society-history',
    displayName: 'CULTURE JOURNALIST',
    emoji: '🎨',
    characterName: 'Hannah Benjamin',
    categories: ['culture', 'society', 'history', 'philosophy'],
    isPolitical: false,
    agentRef: 'be42e143-977a-48ce-85b0-cc25ef466b56',
    skillDir: 'culture-society-history-journalist-agent',
    shortLabel: 'Culture journalist',
    beatSummary:
      'culture, society, history, philosophy, art criticism, cultural lists, and historical explainers.',
  },

  health: {
    id: 'health',
    displayName: 'HEALTH JOURNALIST',
    emoji: '💚',
    characterName: 'Carl Frankl',
    categories: ['health', 'society'],
    isPolitical: false,
    agentRef: '750a2558-8463-483f-aedc-f00e0f60c82f',
    skillDir: 'health-journalist-agent',
    shortLabel: 'Health journalist',
    beatSummary:
      'nutrition, exercise, mental well-being, positive psychology, healthy aging, parenting, and meaningful living.',
  },

  'science-technology': {
    id: 'science-technology',
    displayName: 'SCIENCE JOURNALIST',
    emoji: '🔬',
    characterName: 'Isaac Sagan',
    categories: ['science', 'technology', 'environment'],
    isPolitical: false,
    agentRef: 'd7dc6c3f-5051-41d1-860b-6aa61356dbf8',
    skillDir: 'science-technology-communication-journalist-agent',
    shortLabel: 'Science journalist',
    beatSummary: 'science, technology, and clear explanations of hard topics.',
  },
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
