export type JournalistId =
  | 'left-wing'
  | 'right-wing'
  | 'culture-society-history'
  | 'health'
  | 'science-technology'

export const ALL_JOURNALIST_IDS: JournalistId[] = [
  'left-wing',
  'right-wing',
  'culture-society-history',
  'health',
  'science-technology',
]

export interface PitchSource {
  name: string
  url: string
}

export interface Pitch {
  journalistId: JournalistId
  title: string
  category: string
  leaning?: string
  agencyLevel?: string
  mode?: string
  summary: string
  whyItMattersNow: string
  sources: PitchSource[]
  slug: string
}

export interface PostResult {
  slug: string
  success: boolean
  output: string
}

// Interrupt payloads. `display` and `prompt` drive Studio and the CLI; the other
// fields let the web desk render real controls. Both resume with a plain string.

export interface PitchSelectionInterrupt {
  kind: 'pitch-selection'
  display: string
  prompt: string
  pitches: Partial<Record<JournalistId, Pitch>>
}

export interface ImageReviewInterrupt {
  kind: 'image-review'
  display: string
  prompt: string
  journalistId: JournalistId
  articleTitle: string
  /** data: URL of the generated illustration. */
  image: string
}

export type NewsDeskInterrupt = PitchSelectionInterrupt | ImageReviewInterrupt
