import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeEntities, requireSome } from '../src/main/sources/critics/http'
import { parseBestNew, parseList, parseListIndex, parseReviewDates } from '../src/main/sources/critics/pitchfork'

const fx = (f: string) => readFileSync(new URL(`./fixtures/critics/${f}`, import.meta.url), 'utf8')

describe('critics helpers', () => {
  it('requireSome throws on empty', () => {
    expect(() => requireSome([], 'Pitchfork')).toThrow(/Pitchfork: nothing found/)
  })
  it('decodeEntities leaves out-of-range entities alone', () => {
    expect(decodeEntities('&#99999999;')).toBe('&#99999999;')
  })
  it('decodeEntities', () => {
    expect(decodeEntities('Snakes &amp; Ladders &#8217;&#x2019;')).toBe('Snakes & Ladders ’’')
  })
})

describe('pitchfork', () => {
  it('parseBestNew', () => {
    const albums = parseBestNew(fx('pitchfork-best-new.html'))
    expect(albums.length).toBeGreaterThan(5)
    for (const a of albums) {
      expect(a.title).not.toBe('')
      expect(a.artist).not.toBe('')
      expect(a.reviewUrl).toMatch(/^https:\/\/pitchfork\.com\/reviews\/albums\//)
      expect(a.verdict).toBe('Best New Music')
    }
    expect(albums.find((a) => a.title === 'Snakes & Ladders')?.artist).toBe('Armand Hammer')
  })
  it('parseReviewDates', () => {
    const dates = parseReviewDates(fx('pitchfork-reviews.xml'))
    expect(dates.size).toBeGreaterThan(5)
    for (const ms of dates.values()) {
      expect(Number.isFinite(ms)).toBe(true)
      expect(ms).toBeGreaterThan(Date.UTC(2026, 0, 1))
    }
  })
  it('parseReviewDates does not borrow the next item date', () => {
    const xml = '<item><link>https://a/</link></item><item><link>https://b/</link><pubDate>Sun, 15 Nov 2026 05:00:00 +0000</pubDate></item>'
    expect([...parseReviewDates(xml).keys()]).toEqual(['https://b/'])
  })
  it('parseListIndex survives odd slugs', () => {
    const html = '<a href="/features/lists-and-guides/best--albums-2025/"></a><a href="/features/lists-and-guides/-best-albums-2025/"></a>'
    expect(parseListIndex(html)).toHaveLength(2)
  })
  it('parseListIndex', () => {
    const lists = parseListIndex(fx('pitchfork-lists.html'))
    expect(lists).toContainEqual(expect.objectContaining({ id: 'pitchfork:best-albums-2025', year: 2025, ranked: true }))
    expect(lists.map((l) => l.id)).toContain('pitchfork:best-rock-albums-2025')
    expect(lists.find((l) => l.id === 'pitchfork:best-rock-albums-2025')?.title).toBe('Best Rock Albums 2025')
  })
  it('parseList', () => {
    const albums = parseList(fx('pitchfork-best-albums-2025.html'))
    expect(albums).toHaveLength(50)
    expect(albums.map((a) => a.rank).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    expect(albums).toContainEqual(expect.objectContaining({ artist: 'Sharp Pins', title: 'Radio DDR', rank: 50 }))
    expect(albums.find((a) => a.artist === 'Sharp Pins')?.artUrl).toMatch(/^https:\/\//)
  })
})
