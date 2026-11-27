/**
 * Neighbourhood layout: a 3x3 grid of lots on a square diorama plate,
 * separated by roads. Lots fill from the centre outwards, so the first
 * process (or the big "+") always sits in the middle of the view.
 */

export const LOT_SPACING = 6
export const LOT_SIZE = 4.4
export const ROAD_WIDTH = 1.2
export const PLATE_HALF = 9.6

export type Vec2 = [x: number, z: number]

export const LOT_SLOTS: Vec2[] = [
  [0, 0],
  [LOT_SPACING, 0],
  [0, LOT_SPACING],
  [-LOT_SPACING, 0],
  [0, -LOT_SPACING],
  [LOT_SPACING, LOT_SPACING],
  [-LOT_SPACING, LOT_SPACING],
  [-LOT_SPACING, -LOT_SPACING],
  [LOT_SPACING, -LOT_SPACING],
]

export const MAX_LOTS = LOT_SLOTS.length

/** Road centre lines (both axes), halfway between lot rows. */
export const ROAD_LINES = [-LOT_SPACING / 2, LOT_SPACING / 2]

/** Trees on the outer ring of the plate, kept off the roads. */
export const TREE_SPOTS: { pos: Vec2; scale: number }[] = (() => {
  const ring = PLATE_HALF - 0.75
  const along = [-7.6, -5.2, -0.9, 1.4, 5.0, 7.4]
  const spots: { pos: Vec2; scale: number }[] = []
  along.forEach((t, i) => {
    const s = 0.75 + ((i * 37) % 5) * 0.08
    spots.push({ pos: [t, ring], scale: s })
    spots.push({ pos: [ring, -t], scale: s * 0.92 })
    spots.push({ pos: [-t, -ring], scale: s * 1.05 })
    spots.push({ pos: [-ring, t], scale: s * 0.88 })
  })
  return spots
})()
