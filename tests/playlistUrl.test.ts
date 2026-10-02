import { describe, expect, it } from 'vitest'
import { parsePlaylistUrl } from '../src/main/import/playlistUrl'

const ID = 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'

describe('parsePlaylistUrl', () => {
  it.each([
    `https://www.youtube.com/playlist?list=${ID}`,
    `https://music.youtube.com/playlist?list=${ID}`,
    `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${ID}&index=3`,
    `https://youtu.be/dQw4w9WgXcQ?list=${ID}`,
    `https://m.youtube.com/playlist?list=${ID}`,
    `youtube.com/playlist?list=${ID}`,
    `https://music.youtube.com/browse/VL${ID}`,
    ID,
    `  ${ID}  `
  ])('accepts %s', (url) => {
    expect(parsePlaylistUrl(url)).toEqual({ ok: true, id: ID })
  })

  it.each([
    ['', /paste/i],
    ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', /only youtube/i],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', /list=/],
    ['https://www.youtube.com/playlist?list=LL', /liked songs/i],
    ['https://music.youtube.com/playlist?list=LM', /liked songs/i],
    ['https://www.youtube.com/playlist?list=WL', /private/i],
    ['https://www.youtube.com/playlist?list=abc', /invalid/i]
  ])('rejects %s', (url, message) => {
    const r = parsePlaylistUrl(url)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(message)
  })
})
