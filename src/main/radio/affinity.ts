/** How much each listening signal moves an artist/tag affinity. */
export const WEIGHTS = {
  thumbUp: 1.0,
  fullListen: 0.3,
  quickSkip: -0.5,
  thumbDown: -1.0
} as const

export const QUICK_SKIP_MS = 30_000
export const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000
/** Station-specific feedback counts this much more than global feedback. */
export const STATION_WEIGHT = 2

export function decay(ageMs: number): number {
  return Math.pow(0.5, Math.max(0, ageMs) / HALF_LIFE_MS)
}

/** Weight for a finished or abandoned play. */
export function playWeight(e: { completed: boolean; skipped: boolean; listenedMs: number }): number {
  if (e.completed) return WEIGHTS.fullListen
  if (e.skipped && e.listenedMs < QUICK_SKIP_MS) return WEIGHTS.quickSkip
  return 0
}

/** Combine global + station raw scores and squash to [-1, 1]. */
export function combineAffinity(global: number, station: number): number {
  return Math.tanh((global + STATION_WEIGHT * station) / 2)
}
