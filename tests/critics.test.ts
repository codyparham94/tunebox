import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeEntities, requireSome, rssItems } from '../src/main/sources/critics/http'
import { parseReview, parseReviewIndex, parseTop50 } from '../src/main/sources/critics/needledrop'
import { parseAlbumOfTheDay } from '../src/main/sources/critics/bandcamp'
import { parseAlbumOfTheWeek } from '../src/main/sources/critics/stereogum'
import { parseBestNew, parseList, parseListIndex, parseReviewDates } from '../src/main/sources/critics/pitchfork'

const fx = (f: string) => readFileSync(new URL(`./fixtures/critics/${f}`, import.meta.url), 'utf8')

describe('critics helpers', () => {
  it('requireSome throws on empty', () => {
    expect(() => requireSome([], 'Pitchfork')).toThrow(/Pitchfork: nothing found/)
  })
  it('decodeEntities leaves out-of-range entities alone', () => {
    expect(decodeEntities('&#99999999;')).toBe('&#99999999;')
  })
  it('rssItems skips the channel header and separates items', () => {
    const xml = '<channel><title>C</title><link>c</link><item><title>A</title></item><item><title>B</title></item></channel>'
    expect(rssItems(xml)).toEqual(['<title>A</title>', '<title>B</title>'])
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

describe('needledrop', () => {
  it('parseReviewIndex returns absolute review urls', () => {
    const urls = parseReviewIndex(fx('needledrop-reviews.html'))
    expect(urls.length).toBeGreaterThan(5)
    for (const u of urls) expect(u).toMatch(/^https:\/\/(www\.)?theneedledrop\.com\/album-reviews\/.+-album-review-/)
    expect(new Set(urls).size).toBe(urls.length)
  })
  it('parseReview reads artist, album, score and date', () => {
    const url = 'https://www.theneedledrop.com/album-reviews/brakence-marrow-album-review-ihaqnk-d6ny/'
    const r = parseReview(fx('needledrop-review.html'), url)!
    expect(r.album.artist).toBe('brakence')
    expect(r.album.title).toBe('marroW')
    expect(r.score).toBe(2)
    expect(r.album.verdict).toBe('2/10')
    expect(r.album.date).toBe(Date.parse('2026-11-06T13:04:04.000Z'))
    expect(r.album.artUrl).toMatch(/^https:\/\//)
  })
  it('parseReview falls back to the embedded video thumbnail', () => {
    const html = fx('needledrop-review.html').replace(/<meta property="og:image"[^>]*>/, '')
    expect(parseReview(html, 'https://x/')!.album.artUrl).toBe('https://i.ytimg.com/vi/IHAqnk-D6NY/hqdefault.jpg')
  })
  it('parseReview returns null without a score', () => {
    expect(parseReview('<title>Nothing</title>', 'https://x/')).toBeNull()
  })
  it('parseTop50 reads name + youtube link pairs only', () => {
    const albums = parseTop50(fx('needledrop-top50-2025.txt'), 2025)
    expect(albums.length).toBeGreaterThanOrEqual(40)
    expect(albums.length).toBeLessThanOrEqual(60)
    expect(albums[0]).toMatchObject({ artist: 'Aesop Rock', title: 'Black Hole Superette', verdict: 'Top 50 of 2025' })
    expect(albums.some((a) => a.rank !== undefined)).toBe(false)
    expect(albums.every((a) => a.artUrl?.startsWith('https://i.ytimg.com/vi/'))).toBe(true)
    expect(parseTop50('X - Album - Deluxe\nhttps://www.youtube.com/watch?v=abc', 2025)[0].title).toBe('Album - Deluxe')
  })
})

describe('rss links', () => {
  it('skip an item whose link is not https', () => {
    const item = (link: string) =>
      `<item><title>Album Of The Week: A <em>B</em></title><link>${link}</link><category>Album of the Day</category></item>`
    expect(parseAlbumOfTheWeek(`<rss>${item('http://x/')}</rss>`)).toEqual([])
    expect(parseAlbumOfTheDay(`<rss><item><title>A, “B”</title><link>http://x/</link><category>Album of the Day</category></item></rss>`)).toEqual([])
  })
})

describe('bandcamp', () => {
  it('parseAlbumOfTheDay', () => {
    const xml = fx('bandcamp.xml')
    const albums = parseAlbumOfTheDay(xml)
    expect(albums).toContainEqual(
      expect.objectContaining({ artist: 'Donwill & The Expert', title: 'EXPERTISE', verdict: 'Album of the Day' })
    )
    for (const a of albums) {
      expect(Number.isFinite(a.date)).toBe(true)
      expect(a.reviewUrl).toContain('/album-of-the-day/')
    }
    // the first item after the channel header must not be dropped
    expect(albums[0]).toMatchObject({ title: 'EXPERTISE' })
    expect(albums.some((a) => a.artUrl?.startsWith('https://'))).toBe(true)
    expect(albums.length).toBe((xml.match(/<category>Album of the Day<\/category>/g) ?? []).length)
  })
})

describe('stereogum', () => {
  it('parseAlbumOfTheWeek', () => {
    const xml = fx('stereogum-aotw.xml')
    const albums = parseAlbumOfTheWeek(xml)
    expect(albums).toContainEqual(
      expect.objectContaining({ artist: 'Krill', title: 'Secret Language', verdict: 'Album of the Week' })
    )
    for (const a of albums) {
      expect(a.title).not.toBe('')
      expect(a.artist.endsWith(a.title)).toBe(false)
      expect(Number.isFinite(a.date)).toBe(true)
    }
    expect(albums.length).toBeGreaterThanOrEqual(((xml.match(/<item>/g) ?? []).length * 4) / 5)
  })
})
