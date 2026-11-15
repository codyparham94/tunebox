import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchText } from '../src/main/sources/critics/http'
import { parseReviewIndex, readReviews } from '../src/main/sources/critics/needledrop'

vi.mock('../src/main/sources/critics/http', async (orig) => ({
  ...(await orig<typeof import('../src/main/sources/critics/http')>()),
  fetchText: vi.fn()
}))

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

  it('rejects when the index is down', async () => {
    mocked.mockRejectedValue(new Error('theneedledrop.com: HTTP 503'))
    await expect(readReviews({})).rejects.toThrow(/503/)
  })
})
