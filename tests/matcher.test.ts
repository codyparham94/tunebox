import { describe, expect, it } from 'vitest'
import { ACCEPT_CONFIDENCE, matchTrack, pickBest, scoreCandidate } from '../src/main/sources/matcher'
import { normalizeArtist, normalizeTitle } from '../src/main/util/text'
import { GET_LUCKY_RESULTS } from './fixtures/getLuckySearch'

describe('normalization', () => {
  it('strips feat., remaster and edit noise', () => {
    expect(normalizeTitle('Get Lucky (feat. Pharrell Williams)')).toBe('get lucky')
    expect(normalizeTitle('Here Comes the Sun - Remastered 2009')).toBe('here comes the sun')
    expect(normalizeTitle('Blinding Lights [Official Audio]')).toBe('blinding lights')
    expect(normalizeTitle('Song ft. Someone')).toBe('song')
  })
  it('keeps the primary artist', () => {
    expect(normalizeArtist('Daft Punk, Pharrell Williams')).toBe('daft punk')
    expect(normalizeArtist('The Weeknd feat. Daft Punk')).toBe('weeknd')
    expect(normalizeArtist('Beyoncé & JAY-Z')).toBe('beyonce')
  })
})

describe('scoreCandidate', () => {
  const source = { title: 'Get Lucky', artist: 'Daft Punk', duration: 369 }

  it('prefers the album version with a matching duration', () => {
    const best = pickBest(source, GET_LUCKY_RESULTS)!
    expect(best.track.id).toBe('5NV6Rdv1a3I')
    expect(best.confidence).toBeGreaterThanOrEqual(ACCEPT_CONFIDENCE)
  })

  it('penalizes live, cover and remix versions the source did not ask for', () => {
    const [live, cover, album, , remix] = GET_LUCKY_RESULTS.map((c) => scoreCandidate(source, c))
    expect(live).toBeLessThan(album)
    expect(cover).toBeLessThan(album)
    expect(remix).toBeLessThan(album)
  })

  it('does not penalize a remix when the source is a remix', () => {
    const remixSource = { title: 'Get Lucky (Remix)', artist: 'Daft Punk', duration: 362 }
    expect(pickBest(remixSource, GET_LUCKY_RESULTS)!.track.id).toBe('remix000001')
  })

  it('rewards duration within ±5s', () => {
    const c = GET_LUCKY_RESULTS[2]
    expect(scoreCandidate({ ...source, duration: 372 }, c)).toBeGreaterThan(scoreCandidate({ ...source, duration: 420 }, c))
  })

  it('falls back to the top result when nothing reaches the threshold', () => {
    const result = pickBest({ title: 'Completely Different', artist: 'Nobody' }, GET_LUCKY_RESULTS)!
    expect(result.track.id).toBe(GET_LUCKY_RESULTS[0].id)
    expect(result.confidence).toBeLessThan(ACCEPT_CONFIDENCE)
  })
})

describe('matchTrack', () => {
  it('searches once and then serves from the cache', async () => {
    const cache = new Map<string, { videoId: string | null; confidence: number }>()
    let searches = 0
    const deps = {
      search: async () => {
        searches++
        return GET_LUCKY_RESULTS
      },
      cacheGet: (k: string) => cache.get(k),
      cachePut: (k: string, e: { videoId: string | null; confidence: number }) => void cache.set(k, e),
      lookup: (id: string) => GET_LUCKY_RESULTS.find((t) => t.id === id)
    }
    const meta = { title: 'Get Lucky', artist: 'Daft Punk', duration: 369 }
    expect((await matchTrack(meta, deps))?.track.id).toBe('5NV6Rdv1a3I')
    expect((await matchTrack(meta, deps))?.track.id).toBe('5NV6Rdv1a3I')
    expect(searches).toBe(1)
  })
})
