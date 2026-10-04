import { describe, expect, it } from 'vitest'
import { parsePlaylistUrl } from '../src/main/import/playlistUrl'

const ID = 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'
const SPOTIFY = '37i9dQZF1DXcBWIGoYBM5M'
const APPLE = 'pl.f4d106fed2bd41149aaacabb233eb5eb'

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
  ])('accepts YouTube %s', (url) => {
    expect(parsePlaylistUrl(url)).toEqual({ ok: true, source: 'youtube', id: ID })
  })

  it.each([
    `https://open.spotify.com/playlist/${SPOTIFY}`,
    `https://open.spotify.com/playlist/${SPOTIFY}?si=abc123`,
    `https://open.spotify.com/intl-de/playlist/${SPOTIFY}`,
    `https://open.spotify.com/embed/playlist/${SPOTIFY}`,
    `spotify:playlist:${SPOTIFY}`
  ])('accepts Spotify %s', (url) => {
    expect(parsePlaylistUrl(url)).toEqual({ ok: true, source: 'spotify', id: SPOTIFY })
  })

  it.each([
    [`https://music.apple.com/us/playlist/todays-hits/${APPLE}`, 'us'],
    [`https://music.apple.com/gb/playlist/${APPLE}`, 'gb'],
    [`https://music.apple.com/playlist/todays-hits/${APPLE}?l=en`, 'us']
  ])('accepts Apple Music %s', (url, storefront) => {
    expect(parsePlaylistUrl(url)).toEqual({ ok: true, source: 'apple', id: APPLE, storefront })
  })

  it.each(['https://www.deezer.com/us/playlist/3155776842', 'https://deezer.com/playlist/3155776842?utm_source=x'])('accepts Deezer %s', (url) => {
    expect(parsePlaylistUrl(url)).toEqual({ ok: true, source: 'deezer', id: '3155776842' })
  })

  it.each(['https://spotify.link/AbCdEf', 'https://link.deezer.com/s/30xyz'])('asks to follow share link %s', (url) => {
    expect(parsePlaylistUrl(url)).toMatchObject({ ok: false, shortLink: true })
  })

  it.each([
    ['', /paste/i],
    ['https://soundcloud.com/someone/sets/mix', /spotify, apple music or deezer/i],
    ['https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy', /isn’t a playlist/i],
    ['https://music.apple.com/us/album/1989/1440935467', /isn’t a playlist/i],
    ['https://www.deezer.com/us/album/302127', /isn’t a playlist/i],
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
