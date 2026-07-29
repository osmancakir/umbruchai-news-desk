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
