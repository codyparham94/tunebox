import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchText } from '../src/main/sources/critics/http'
import { readBestNew } from '../src/main/sources/critics/pitchfork'

vi.mock('../src/main/sources/critics/http', async (orig) => ({
  ...(await orig<typeof import('../src/main/sources/critics/http')>()),
  fetchText: vi.fn()
}))

const page = readFileSync(new URL('./fixtures/critics/pitchfork-best-new.html', import.meta.url), 'utf8')
const mocked = vi.mocked(fetchText)

describe('readBestNew outages', () => {
  beforeEach(() => {
    mocked.mockReset()
  })

  it('still returns albums, without dates, when the RSS is down', async () => {
    mocked.mockImplementation(async (url) => {
      if (url.includes('/feed/')) throw new Error('pitchfork.com: HTTP 503')
      return page
    })
    const albums = await readBestNew()
    expect(albums.length).toBeGreaterThan(5)
    expect(albums.every((a) => a.date === undefined)).toBe(true)
  })

  it('rejects when the Best New page is down', async () => {
    mocked.mockImplementation(async (url) => {
      if (url.includes('/reviews/best/')) throw new Error('pitchfork.com: HTTP 503')
      return ''
    })
    await expect(readBestNew()).rejects.toThrow(/HTTP 503/)
  })
})
