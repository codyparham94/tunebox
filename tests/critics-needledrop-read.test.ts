import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { channelVideo } from '../src/main/sources/ytmusic'
import { fetchText } from '../src/main/sources/critics/http'
import { parseReviewIndex, readReviews, readTop50Lists } from '../src/main/sources/critics/needledrop'

vi.mock('../src/main/sources/critics/http', async (orig) => ({
  ...(await orig<typeof import('../src/main/sources/critics/http')>()),
  fetchText: vi.fn()
}))

vi.mock('../src/main/sources/ytmusic', () => ({ channelVideo: vi.fn() }))

const fx = (f: string) => readFileSync(new URL(`./fixtures/critics/${f}`, import.meta.url), 'utf8')
const mocked = vi.mocked(fetchText)
const index = fx('needledrop-reviews.html')
const review = fx('needledrop-review.html')
const urls = parseReviewIndex(index)
const brakence = urls.find((u) => u.includes('brakence'))!
const [failing, missed] = urls.filter((u) => u !== brakence)

describe('readReviews', () => {
  beforeEach(() => {
    mocked.mockReset()
  })

  it('fetches only the index when every review is already seen', async () => {
    mocked.mockResolvedValue(index)
    const out = await readReviews(Object.fromEntries(urls.map((u) => [u, null])))
    expect(mocked).toHaveBeenCalledTimes(1)
    expect(out.albums).toEqual([])
  })

  it('keeps 8+ scores, caches parse misses, and does not cache failed fetches', async () => {
    mocked.mockImplementation(async (u) => {
      if (u.endsWith('/album-reviews/')) return index
      if (u === failing) throw new Error('theneedledrop.com: HTTP 503')
      if (u === brakence) return review.replace('content="2/10"', 'content="9/10"')
      return '<title>Nothing</title>'
    })
    const out = await readReviews({})
    expect(out.albums.map((a) => a.artist)).toEqual(['brakence'])
    expect(out.albums[0].verdict).toBe('9/10')
    expect(failing in out.seen).toBe(false)
    expect(out.seen[missed]).toBeNull()
  })

  const pageOf = (n: number) =>
    Array.from({ length: 5 }, (_, k) => `<a href="/album-reviews/p${n}-${k}-album-review-x/"></a>`).join('')

  it('reads three index pages when nothing is seen', async () => {
    mocked.mockImplementation(async (u) => {
      const m = /page\/(\d)\/$/.exec(u)
      if (u.endsWith('/album-reviews/') || m) return pageOf(m ? +m[1] : 1)
      return '<title>Nothing</title>'
    })
    await readReviews({})
    const indexFetches = mocked.mock.calls.filter(([u]) => /\/album-reviews\/(page\/\d\/)?$/.test(u))
    expect(indexFetches).toHaveLength(3)
    expect(mocked).toHaveBeenCalledTimes(3 + 15)
  })

  it('still returns page 1 albums when page 2 fails', async () => {
    mocked.mockImplementation(async (u) => {
      if (u.includes('/page/')) throw new Error('theneedledrop.com: HTTP 503')
      if (u.endsWith('/album-reviews/')) return index
      return u === brakence ? review.replace('content="2/10"', 'content="9/10"') : '<title>Nothing</title>'
    })
    const out = await readReviews({})
    expect(out.albums.map((a) => a.artist)).toEqual(['brakence'])
  })

  it('rejects when the index is down', async () => {
    mocked.mockRejectedValue(new Error('theneedledrop.com: HTTP 503'))
    await expect(readReviews({})).rejects.toThrow(/503/)
  })
})

describe('readTop50Lists', () => {
  const video = vi.mocked(channelVideo)
  const withText = (description: string) => ({ description }) as Awaited<ReturnType<typeof channelVideo>>

  it('rejects when no year has a video', async () => {
    video.mockResolvedValue(undefined as never)
    await expect(readTop50Lists([2025, 2024])).rejects.toThrow('nothing found')
  })
  it('skips a year whose description has no album lines', async () => {
    video.mockResolvedValueOnce(withText('no albums here')).mockResolvedValueOnce(withText('X - Album\nhttps://www.youtube.com/watch?v=abc'))
    const lists = await readTop50Lists([2025, 2024])
    expect(lists.map((l) => l.id)).toEqual(['needledrop:top50-2024'])
  })
})
