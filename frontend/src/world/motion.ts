/**
 * Shared "pop" motion: an under-damped spring, so things snap in with a small
 * overshoot and settle fast. Frame-rate independent (fixed substeps).
 */

export type Spring = { x: number; v: number }

/** ~15% overshoot, settles in ~0.35 s. */
export const POP = { stiffness: 340, damping: 19 }
/** Quicker and nearly flat, for things leaving the scene. */
export const OUT = { stiffness: 520, damping: 42 }

const SUBSTEP = 1 / 240

export function spring(x = 0): Spring {
  return { x, v: 0 }
}

export function stepSpring(s: Spring, target: number, dt: number, cfg: { stiffness: number; damping: number } = POP) {
  let left = Math.min(dt, 0.1) // a background tab must not explode the spring
  while (left > 0) {
    const h = Math.min(SUBSTEP, left)
    s.v += (cfg.stiffness * (target - s.x) - cfg.damping * s.v) * h
    s.x += s.v * h
    left -= h
  }
  return s.x
}

/** Spring scale never goes below this, so meshes don't flip inside out. */
export function safeScale(x: number) {
  return Math.max(0.001, x)
}
