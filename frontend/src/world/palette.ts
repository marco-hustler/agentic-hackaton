import type { ProcessKind, ProcessStatus } from '../types/process'

/** Diorama colours, taken from DESIGN.md (Tactical Diorama). */
export const WORLD = {
  background: '#f8f6f0',
  plateBase: '#2f7a57',
  plateEdge: '#0f172a',
  lawn: '#cfdfc8',
  lawnDark: '#b9d0b1',
  lot: '#eae0d5',
  road: '#3b475c',
  roadMark: '#f8f6f0',
  houseWall: '#ffffff',
  houseTrim: '#f0eee8',
  door: '#1e293b',
  window: '#fde9b8',
  trunk: '#8b6b4a',
  canopy: ['#059669', '#2f9e78', '#4fae86'],
  terracotta: '#e05a47',
  sage: '#059669',
  sky: '#0284c7',
  amber: '#d97706',
  petrol: '#1e293b',
} as const

export const KIND_META: Record<ProcessKind, { label: string; roof: string }> = {
  separation: { label: 'Separation', roof: WORLD.terracotta },
  inheritance: { label: 'Inheritance', roof: WORLD.petrol },
  other: { label: 'Other split', roof: WORLD.sage },
}

export const STATUS_META: Record<ProcessStatus, { label: string; pill: string }> = {
  draft: { label: 'Draft', pill: 'pill-draft' },
  collecting: { label: 'Collecting', pill: 'pill-draft' },
  ready: { label: 'Ready to split', pill: 'pill-live' },
  resolved: { label: 'Settled', pill: 'pill-settled' },
  closed: { label: 'Closed', pill: 'pill-neutral' },
}

/** One colour per participant pawn standing in front of a house. */
export const PAWN_COLORS = [WORLD.terracotta, WORLD.sage, WORLD.petrol, WORLD.amber, '#9a6b4f']

/** Crate colour per item category inside rooms. */
export function categoryColor(category: string) {
  const palette = ['#e05a47', '#059669', '#1e293b', '#d97706', '#9a6b4f', '#64748b']
  let h = 0
  for (const c of category) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}
