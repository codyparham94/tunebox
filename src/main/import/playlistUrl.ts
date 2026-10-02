/** Private/account playlists can't be read without a login. */
const UNSUPPORTED = /^(LL|LM|WL|LRYR|FL)$/

export type ParsedPlaylist = { ok: true; id: string } | { ok: false; error: string }

/**
 * Accepts youtube.com / music.youtube.com / youtu.be URLs with a `list=` param, or a bare list id.
 */
export function parsePlaylistUrl(input: string): ParsedPlaylist {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Paste a YouTube or YouTube Music playlist URL.' }

  let id: string | null = null
  if (/^[\w-]{2,}$/.test(raw) && !raw.includes('.')) {
    id = raw
  } else {
    let url: URL
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    } catch {
      return { ok: false, error: 'That doesn’t look like a URL.' }
    }
    const host = url.hostname.replace(/^www\.|^m\./, '')
    if (!['youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
      return { ok: false, error: 'Only youtube.com and music.youtube.com playlists are supported.' }
    }
    id = url.searchParams.get('list')
    if (!id && url.pathname.startsWith('/browse/VL')) id = url.pathname.slice('/browse/VL'.length)
  }

  if (!id) return { ok: false, error: 'No playlist id found. The URL needs a “list=” parameter.' }
  id = id.replace(/^VL/, '')
  if (UNSUPPORTED.test(id)) {
    return { ok: false, error: 'Liked songs and private playlists can’t be imported without signing in.' }
  }
  if (!/^[\w-]{10,}$/.test(id)) return { ok: false, error: 'That playlist id looks invalid.' }
  return { ok: true, id }
}
