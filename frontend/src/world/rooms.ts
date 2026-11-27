import type { ProcessSummary } from '../types/process'
import { PAWN_COLORS } from './palette'

/**
 * House interiors: one room per person contending for the items.
 * Variants exist for 2, 3, 4 and 5 rooms; fewer people still get 2 rooms,
 * more than 5 share the 5-room plan.
 */

export const MIN_ROOMS = 2
export const MAX_ROOMS = 5

/** Interior footprint, centred on the lot. x = width, z = depth. */
export const INTERIOR = { w: 4.0, d: 3.4, wallH: 1.05, lowWallH: 0.22, partitionH: 0.7, wall: 0.08 }

/** Room rectangle in normalised plan coords: u along x, v along z, both 0..1. */
export type RoomRect = { u0: number; v0: number; u1: number; v1: number }

export const ROOM_PLANS: Record<number, RoomRect[]> = {
  2: [
    { u0: 0, v0: 0, u1: 0.5, v1: 1 },
    { u0: 0.5, v0: 0, u1: 1, v1: 1 },
  ],
  3: [
    { u0: 0, v0: 0, u1: 0.55, v1: 1 },
    { u0: 0.55, v0: 0, u1: 1, v1: 0.5 },
    { u0: 0.55, v0: 0.5, u1: 1, v1: 1 },
  ],
  4: [
    { u0: 0, v0: 0, u1: 0.5, v1: 0.5 },
    { u0: 0.5, v0: 0, u1: 1, v1: 0.5 },
    { u0: 0, v0: 0.5, u1: 0.5, v1: 1 },
    { u0: 0.5, v0: 0.5, u1: 1, v1: 1 },
  ],
  5: [
    { u0: 0, v0: 0, u1: 0.4, v1: 0.5 },
    { u0: 0.4, v0: 0, u1: 0.7, v1: 0.5 },
    { u0: 0.7, v0: 0, u1: 1, v1: 0.5 },
    { u0: 0, v0: 0.5, u1: 0.5, v1: 1 },
    { u0: 0.5, v0: 0.5, u1: 1, v1: 1 },
  ],
}

export const ROOM_KINDS = ['Living room', 'Kitchen', 'Bedroom', 'Studio', 'Hallway'] as const
export type RoomKind = (typeof ROOM_KINDS)[number]

export function roomCountFor(people: number) {
  return Math.min(MAX_ROOMS, Math.max(MIN_ROOMS, people))
}

/** World-space rect (relative to the lot centre) for a plan rect. */
export function roomBounds(r: RoomRect) {
  const x0 = -INTERIOR.w / 2 + r.u0 * INTERIOR.w
  const x1 = -INTERIOR.w / 2 + r.u1 * INTERIOR.w
  const z0 = -INTERIOR.d / 2 + r.v0 * INTERIOR.d
  const z1 = -INTERIOR.d / 2 + r.v1 * INTERIOR.d
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }
}

export type RoomInfo = {
  kind: RoomKind
  owner: string
  color: string
  /** Category of each item placed in the room (drives crate colours). */
  itemCategories: string[]
}

export function participantNames(process: ProcessSummary): string[] {
  const fromEmail = (e: string) => {
    const local = e.split('@')[0].replace(/[._-]+/g, ' ').trim()
    return local ? local[0].toUpperCase() + local.slice(1) : e
  }
  return ['You', ...process.participantEmails.map(fromEmail)]
}

export function participantColor(i: number) {
  return PAWN_COLORS[i % PAWN_COLORS.length]
}

/** Rooms for a process: one per person, padded to at least two. */
export function buildRooms(process: ProcessSummary, itemsPerRoom: string[][] = []): RoomInfo[] {
  const names = participantNames(process)
  const n = roomCountFor(names.length)
  return Array.from({ length: n }, (_, i) => ({
    kind: ROOM_KINDS[i],
    owner: names[i] ?? 'Invite someone',
    color: participantColor(i),
    itemCategories: itemsPerRoom[i] ?? [],
  }))
}
