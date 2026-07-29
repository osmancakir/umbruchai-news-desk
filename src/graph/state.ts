import { Annotation } from '@langchain/langgraph'
import type { Pitch, PostResult, JournalistId } from '../types.js'

export const StateAnnotation = Annotation.Root({
  date: Annotation<string>({
    reducer: (_curr, update) => update,
    default: () => new Date().toISOString().split('T')[0],
  }),

  // Optional targeted mode: run a single journalist with a seeded idea
  targetJournalistId: Annotation<JournalistId | undefined>({
    reducer: (_curr, update) => update,
    default: () => undefined,
  }),

  pitchIdea: Annotation<string | undefined>({
    reducer: (_curr, update) => update,
    default: () => undefined,
  }),

  // Set per parallel branch via Send — ephemeral per branch
  activeJournalistId: Annotation<JournalistId>({
    reducer: (_curr, update) => update,
    default: () => 'left-wing' as JournalistId,
  }),

  // Accumulated across all parallel pitch branches
  pitches: Annotation<Record<string, Pitch>>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({}),
  }),

  // Set by user after interrupt
  selectedIds: Annotation<JournalistId[]>({
    reducer: (_curr, update) => update,
    default: () => [],
  }),

  // Accumulated across all parallel generation branches
  articles: Annotation<Record<string, unknown>>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({}),
  }),

  // Set to true to bypass the image generation/review loop entirely
  skipImageGeneration: Annotation<boolean>({
    reducer: (_curr, update) => update,
    default: () => false,
  }),

  // Image workflow — managed by sequential image nodes (replace reducers so deletions work)
  pendingImages: Annotation<Record<string, string>>({
    reducer: (_curr, update) => update,
    default: () => ({}),
  }),

  approvedImages: Annotation<Record<string, string>>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({}),
  }),

  imageCustomPrompts: Annotation<Record<string, string>>({
    reducer: (_curr, update) => update,
    default: () => ({}),
  }),

  // Accumulated by sequential posting phase
  postResults: Annotation<PostResult[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
})

export type State = typeof StateAnnotation.State
