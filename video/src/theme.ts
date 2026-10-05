import { loadFont as loadInter } from '@remotion/google-fonts/Inter'
import { loadFont as loadSourceSerif } from '@remotion/google-fonts/SourceSerif4'

export const FONT_SANS = loadInter('normal', { weights: ['400', '600', '800'], subsets: ['latin'] }).fontFamily
export const FONT_SERIF = loadSourceSerif('normal', { weights: ['600', '700'], subsets: ['latin'] }).fontFamily

export const COLORS = {
  // Taken from the red wall and belt in the presenter illustration.
  brand: '#C8322B',
  paper: '#F6F1E7',
  ink: '#1D1B19',
  inkMuted: '#5E5850',
  shadow: 'rgba(20, 16, 12, 0.35)',
}

/**
 * Where the 9:16 reel stays visible under Instagram's UI. On tall phones the app scales
 * the video to fill the screen height, cropping ~50px off each side (~100px with no
 * bottom bar); the status bar and back/camera icons cover the top ~230px.
 */
export const REEL_SAFE = { x: 80, top: 250 }

const CATEGORIES: Record<string, { label: string; color: string }> = {
  'politics-economics': { label: 'Politik & Wirtschaft', color: '#C8322B' },
  culture: { label: 'Kultur', color: '#7B4FA0' },
  society: { label: 'Gesellschaft', color: '#D27A1F' },
  history: { label: 'Geschichte', color: '#8A5A3B' },
  philosophy: { label: 'Philosophie', color: '#4B5AA8' },
  health: { label: 'Gesundheit', color: '#2E8B57' },
  science: { label: 'Wissenschaft', color: '#2A6FB0' },
  technology: { label: 'Technologie', color: '#14858A' },
  environment: { label: 'Umwelt', color: '#4F8A2E' },
  sports: { label: 'Sport', color: '#D9572B' },
}

export function categoryStyle(category: string): { label: string; color: string } {
  return CATEGORIES[category] ?? { label: category, color: COLORS.inkMuted }
}
