import type { PlaylistSource } from '@shared/types'

/** Private/account playlists can't be read without a login. */
const UNSUPPORTED = /^(LL|LM|WL|LRYR|FL)$/

/** Share links that only redirect to the real playlist address. */
export const SHORT_LINK_HOSTS = ['spotify.link', 'link.deezer.com', 'deezer.page.link']

const SUPPORTED = 'Paste a YouTube, YouTube Music, Spotify, Apple Music or Deezer playlist link.'

export type ParsedPlaylist =
  | { ok: true; source: PlaylistSource; id: string; /** Apple Music store country, e.g. "us" */ storefront?: string }
  | { ok: false; error: string; /** a share link to follow before parsing again */ shortLink?: boolean }

/**
 * Accepts playlist links from YouTube (youtube.com / music.youtube.com / youtu.be with `list=`, or a
 * bare list id), Spotify (open.spotify.com/playlist/… or spotify:playlist:…), Apple Music
 * (music.apple.com/…/playlist/…/pl.…) and Deezer (deezer.com/…/playlist/123).
 */
export function parsePlaylistUrl(input: string): ParsedPlaylist {
  const raw = input.trim()
  if (!raw) return { ok: false, error: SUPPORTED }

  const uri = raw.match(/^spotify:playlist:([A-Za-z0-9]{22})$/)
  if (uri) return { ok: true, source: 'spotify', id: uri[1] }

  if (/^[\w-]{2,}$/.test(raw) && !raw.includes('.')) return youtubeId(raw)

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return { ok: false, error: 'That doesn’t look like a link.' }
  }
  const host = url.hostname.replace(/^(www|m)\./, '')
  const parts = url.pathname.split('/').filter(Boolean)

  if (['youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
    let id = url.searchParams.get('list')
    if (!id && url.pathname.startsWith('/browse/VL')) id = url.pathname.slice('/browse/VL'.length)
    if (!id) return { ok: false, error: 'No playlist id found. The URL needs a “list=” parameter.' }
    return youtubeId(id)
  }

  if (host === 'open.spotify.com') {
    const i = parts.indexOf('playlist')
    const id = i >= 0 ? parts[i + 1] : undefined
    if (!id) return { ok: false, error: 'That Spotify link isn’t a playlist. Use Share → Copy link to playlist.' }
    if (!/^[A-Za-z0-9]{22}$/.test(id)) return { ok: false, error: 'That Spotify playlist id looks invalid.' }
    return { ok: true, source: 'spotify', id }
  }

  if (host === 'music.apple.com') {
    const i = parts.indexOf('playlist')
    const id = i >= 0 ? parts.slice(i + 1).find((p) => p.startsWith('pl.')) : undefined
    if (!id) return { ok: false, error: 'That Apple Music link isn’t a playlist. Use Share → Copy Link on the playlist.' }
    const storefront = /^[a-z]{2}$/.test(parts[0] ?? '') ? parts[0] : 'us'
    return { ok: true, source: 'apple', id, storefront }
  }

  if (host === 'deezer.com') {
    const i = parts.indexOf('playlist')
    const id = i >= 0 ? parts[i + 1] : undefined
    if (!id || !/^\d+$/.test(id)) return { ok: false, error: 'That Deezer link isn’t a playlist.' }
    return { ok: true, source: 'deezer', id }
  }

  if (SHORT_LINK_HOSTS.includes(host)) return { ok: false, error: 'Follow this share link first.', shortLink: true }

  return { ok: false, error: SUPPORTED }
}

function youtubeId(raw: string): ParsedPlaylist {
  const id = raw.replace(/^VL/, '')
  if (UNSUPPORTED.test(id)) {
    return { ok: false, error: 'Liked songs and private playlists can’t be imported without signing in.' }
  }
  if (!/^[\w-]{10,}$/.test(id)) return { ok: false, error: 'That playlist id looks invalid.' }
  return { ok: true, source: 'youtube', id }
}
