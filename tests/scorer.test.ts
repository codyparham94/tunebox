import { describe, expect, it } from 'vitest'
import { EXPLORATION, mergeCandidates, pickTracks, scoreCandidates, type Candidate, type ScoreContext } from '../src/main/radio/scorer'
import { trackKey } from '../src/main/util/text'

const c = (artist: string, title: string, similarity: number, extra: Partial<Candidate> = {}): Candidate => ({
  key: trackKey(artist, title),
  artist,
  title,
  similarity,
  sources: ['lastfm-track'],
  reason: 'Similar to seed',
  ...extra
})

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  artistAffinity: new Map(),
  tagAffinity: new Map(),
  recentPlays: new Set(),
  bannedIds: new Set(),
  bannedArtists: new Set(),
  ...over
})

/** Deterministic RNG (mulberry32). */
function rng(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const never = () => 0.99

describe('scoreCandidates', () => {
  const pool = [c('Alpha', 'One', 0.8), c('Beta', 'Two', 0.7), c('Gamma', 'Three', 0.6)]

  it('ranks by similarity with no feedback', () => {
    const order = pickTracks(scoreCandidates(pool, ctx()), 3, [], never).map((s) => s.candidate.artist)
    expect(order).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('feedback changes the ranking', () => {
    const liked = ctx({ artistAffinity: new Map([['gamma', 0.95], ['alpha', -0.9]]) })
    const order = pickTracks(scoreCandidates(pool, liked), 3, [], never).map((s) => s.candidate.artist)
    expect(order[0]).toBe('Gamma')
    expect(order[2]).toBe('Alpha')
    expect(scoreCandidates(pool, liked).find((s) => s.candidate.artist === 'Gamma')!.reason).toBe('You like Gamma')
  })

  it('tag affinity counts', () => {
    const tagged = [c('Alpha', 'One', 0.6, { tags: ['jazz'] }), c('Beta', 'Two', 0.6, { tags: ['metal'] })]
    const s = scoreCandidates(tagged, ctx({ tagAffinity: new Map([['jazz', 0.9], ['metal', -0.9]]) }))
    expect(s[0].base).toBeGreaterThan(s[1].base)
  })

  it('respects banned tracks and artists', () => {
    const withIds = [c('Alpha', 'One', 0.9, { id: 'aaaaaaaaaaa' }), ...pool.slice(1)]
    const s = scoreCandidates(withIds, ctx({ bannedIds: new Set(['aaaaaaaaaaa']), bannedArtists: new Set(['beta']) }))
    expect(s.map((x) => x.candidate.artist)).toEqual(['Gamma'])
  })

  it('penalizes tracks from the last 50 plays', () => {
    const s = scoreCandidates(pool, ctx({ recentPlays: new Set([trackKey('Alpha', 'One')]) }))
    expect(pickTracks(s, 1, [], never)[0].candidate.artist).toBe('Beta')
  })

  it('source agreement raises the score', () => {
    const [single] = scoreCandidates([c('A', 'x', 0.5)], ctx())
    const [agreed] = scoreCandidates([c('A', 'x', 0.5, { sources: ['lastfm-track', 'ytm', 'lastfm-artist'] })], ctx())
    expect(agreed.base).toBeGreaterThan(single.base)
  })
})

describe('pickTracks', () => {
  it('avoids the same artist within the last 3 picks', () => {
    const pool = [c('Alpha', 'One', 0.9), c('Alpha', 'Two', 0.88), c('Beta', 'Three', 0.7)]
    const order = pickTracks(scoreCandidates(pool, ctx()), 3, [], never).map((s) => s.candidate.title)
    expect(order).toEqual(['One', 'Three', 'Two'])
  })

  it('applies the penalty to artists already queued', () => {
    const pool = [c('Alpha', 'One', 0.9), c('Beta', 'Two', 0.8)]
    expect(pickTracks(scoreCandidates(pool, ctx()), 1, ['Alpha'], never)[0].candidate.artist).toBe('Beta')
  })

  it('explores the lower half about 15% of the time', () => {
    const pool = Array.from({ length: 200 }, (_, i) => c(`Artist ${i}`, `Song ${i}`, 1 - i / 200))
    const scored = scoreCandidates(pool, ctx())
    const random = rng(42)
    let explored = 0
    let total = 0
    for (let round = 0; round < 40; round++) {
      for (const p of pickTracks(scored, 25, [], random)) {
        total++
        if (p.explored) explored++
      }
    }
    expect(explored / total).toBeGreaterThan(EXPLORATION - 0.04)
    expect(explored / total).toBeLessThan(EXPLORATION + 0.04)
  })
})

describe('mergeCandidates', () => {
  it('merges duplicates across sources and keeps the strongest reason', () => {
    const merged = mergeCandidates([
      c('Daft Punk', 'Get Lucky (feat. Pharrell)', 0.4, { sources: ['ytm'], id: 'abcdefghijk', reason: 'Up next' }),
      c('Daft Punk', 'Get Lucky', 0.9, { reason: 'Similar to X' })
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: 'abcdefghijk', similarity: 0.9, reason: 'Similar to X' })
    expect(merged[0].sources.sort()).toEqual(['lastfm-track', 'ytm'])
  })
})
