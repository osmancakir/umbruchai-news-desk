import { ALL_JOURNALIST_IDS } from '../../src/types'
import type { JournalistId, NewsDeskInterrupt, Pitch, PostResult } from '../../src/types'

/** The graph state as the browser sees it (mirrors src/graph/state.ts). */
export type DeskState = {
  date?: string
  targetJournalistId?: JournalistId
  pitchIdea?: string
  activeJournalistId?: JournalistId
  skipImageGeneration?: boolean
  pitches?: Partial<Record<JournalistId, Pitch>>
  selectedIds?: JournalistId[]
  articles?: Partial<Record<JournalistId, unknown>>
  pendingImages?: Partial<Record<JournalistId, string>>
  approvedImages?: Partial<Record<JournalistId, string>>
  postResults?: PostResult[]
}

export type DeskInput = Pick<DeskState, 'date' | 'targetJournalistId' | 'pitchIdea' | 'skipImageGeneration'>

export type StageKey = 'pitch' | 'write' | 'check' | 'illustrate' | 'publish'
export type StageStatus = 'pending' | 'running' | 'done' | 'waiting' | 'error' | 'skipped'

export const STAGES: { key: StageKey; label: string }[] = [
  { key: 'pitch', label: 'Pitch' },
  { key: 'write', label: 'Write' },
  { key: 'check', label: 'Check' },
  { key: 'illustrate', label: 'Illustrate' },
  { key: 'publish', label: 'Publish' },
]

const NODE_STAGE: Record<string, StageKey> = {
  pitchJournalist: 'pitch',
  generateArticle: 'write',
  validateAndFixArticle: 'check',
  generateArticleImage: 'illustrate',
  reviewArticleImage: 'illustrate',
  postAllArticles: 'publish',
}

/** One graph task (one node execution) as reported by the `tasks` stream. */
export interface TaskRecord {
  id: string
  node: string
  /** null for nodes that act on every journalist at once, like postAllArticles. */
  journalistId: JournalistId | null
  status: 'running' | 'done' | 'error'
  error?: string
}

/**
 * Which journalist a task is working for, read from the task's input.
 * Send-dispatched nodes carry it as activeJournalistId; the image nodes pick
 * their journalist from state the same way nodes.ts does.
 */
export function journalistForTask(node: string, input: DeskState): JournalistId | null {
  switch (node) {
    case 'pitchJournalist':
    case 'generateArticle':
    case 'validateAndFixArticle':
      return input.activeJournalistId ?? null
    case 'generateArticleImage':
      return (Object.keys(input.articles ?? {}) as JournalistId[]).find((id) => !input.approvedImages?.[id]) ?? null
    case 'reviewArticleImage':
      return (Object.keys(input.pendingImages ?? {})[0] as JournalistId | undefined) ?? null
    default:
      return null
  }
}

export function lanesFor(values: DeskState): JournalistId[] {
  return values.targetJournalistId ? [values.targetJournalistId] : ALL_JOURNALIST_IDS
}

/** pitchJournalist's fallback when the agent never called submit_pitch. */
export function isEmptyPitch(pitch: Pitch): boolean {
  return pitch.slug.startsWith('no-pitch-')
}

interface LaneContext {
  values: DeskState
  tasks: TaskRecord[]
  interrupt: NewsDeskInterrupt | undefined
  /** True once the thread has stopped without waiting on the editor. */
  finished: boolean
}

export function laneStages(id: JournalistId, ctx: LaneContext): Record<StageKey, StageStatus> {
  const { values, tasks, interrupt, finished } = ctx

  const live = (stage: StageKey): TaskRecord['status'] | undefined => {
    const matching = tasks.filter(
      (t) => NODE_STAGE[t.node] === stage && (t.journalistId === id || t.journalistId === null),
    )
    if (matching.some((t) => t.status === 'running')) return 'running'
    return matching.at(-1)?.status
  }

  const pitch = values.pitches?.[id]
  const article = values.articles?.[id]
  const postResult = pitch ? values.postResults?.find((r) => r.slug === pitch.slug) : undefined
  const imageApproved = !!values.approvedImages?.[id]
  const reviewingThis = interrupt?.kind === 'image-review' && interrupt.journalistId === id

  const selectionMade =
    (values.selectedIds?.length ?? 0) > 0 ||
    Object.keys(values.articles ?? {}).length > 0 ||
    (finished && Object.keys(values.pitches ?? {}).length > 0)
  const dropped = selectionMade && !article && !values.selectedIds?.includes(id)

  const resolve = (stage: StageKey, done: boolean): StageStatus => {
    const status = live(stage)
    if (status === 'running') return 'running'
    if (done) return 'done'
    if (status === 'error') return 'error'
    return 'pending'
  }

  // Parallel branches only commit their state when the whole superstep ends, so a
  // journalist who finishes early has a done task but no pitch/article in values yet.
  const pitchStatus = resolve('pitch', !!pitch || live('pitch') === 'done')
  if (dropped) {
    return { pitch: pitchStatus, write: 'skipped', check: 'skipped', illustrate: 'skipped', publish: 'skipped' }
  }

  // Later stages only happen after the earlier ones, so they double as evidence
  // when the thread was loaded mid-run and the earlier task events were missed.
  const pastCheck = imageApproved || !!values.pendingImages?.[id] || !!postResult

  return {
    pitch: interrupt?.kind === 'pitch-selection' && pitch && !isEmptyPitch(pitch) ? 'waiting' : pitchStatus,
    write: resolve('write', !!article || live('write') === 'done'),
    check: resolve('check', pastCheck || (live('check') === 'done')),
    illustrate: values.skipImageGeneration
      ? 'skipped'
      : reviewingThis
        ? 'waiting'
        : resolve('illustrate', imageApproved),
    publish: postResult ? (postResult.success ? 'done' : 'error') : resolve('publish', false),
  }
}

/** One-line status for the masthead. */
export function deskHeadline(ctx: {
  interrupt: NewsDeskInterrupt | undefined
  isLoading: boolean
  tasks: TaskRecord[]
  values: DeskState
}): string {
  const { interrupt, isLoading, tasks, values } = ctx
  if (interrupt?.kind === 'pitch-selection') return 'Your call: which stories run today?'
  if (interrupt?.kind === 'image-review') return 'Your call: does this illustration work?'
  if (isLoading) {
    const running = new Set(tasks.filter((t) => t.status === 'running').map((t) => t.node))
    if (running.has('pitchJournalist')) return 'Journalists are researching their pitches…'
    if (running.has('generateArticle')) return 'Writing the articles…'
    if (running.has('validateAndFixArticle')) return 'Checking and fixing the articles…'
    if (running.has('generateArticleImage')) return 'The illustrator is drawing…'
    if (running.has('postAllArticles')) return 'Publishing to Sanity, with audio…'
    return 'The desk is working…'
  }
  if (values.postResults?.length) return 'Edition closed.'
  if (Object.keys(values.pitches ?? {}).length > 0) return 'Nothing was selected. Edition closed.'
  return 'Ready when you are.'
}
