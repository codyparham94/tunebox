import type { CriticAlbum } from '@shared/types'
import { decodeEntities, fetchText, requireSome } from './http'

const FEED = 'https://www.stereogum.com/category/reviews/album-of-the-week/feed/'
const PREFIX = 'Album Of The Week: '

export function parseAlbumOfTheWeek(xml: string): CriticAlbum[] {
  const out: CriticAlbum[] = []
  for (const chunk of xml.split('</item>')) {
    const start = chunk.indexOf('<item>') // the first chunk also holds the channel header
    if (start < 0) continue
    const item = chunk.slice(start)
    const raw = /<title>(.*?)<\/title>/s.exec(item)?.[1]
    const link = /<link>(.*?)<\/link>/s.exec(item)?.[1].trim()
    const pub = /<pubDate>(.*?)<\/pubDate>/s.exec(item)?.[1]
    if (!raw || !link) continue
    const full = decodeEntities(raw).trim()
    if (!full.startsWith(PREFIX)) continue
    // the album is the first <em>; the feed escapes it (&lt;em&gt;), sometimes inside CDATA
    const em = /<em>(.*?)<\/em>/s.exec(decodeEntities(item))
    const album = em ? decodeEntities(em[1].replace(/<[^>]+>/g, '')).trim() : ''
    const rest = full.slice(PREFIX.length)
    if (!album || !rest.endsWith(album)) continue
    const artist = rest.slice(0, rest.length - album.length).trim()
    if (!artist) continue
    const art = /<media:content[^>]*?url="([^"]+)"/.exec(item)
    const date = pub ? Date.parse(pub) : NaN
    out.push({
      title: album,
      artist,
      artUrl: art ? decodeEntities(art[1]) : undefined,
      source: 'stereogum',
      verdict: 'Album of the Week',
      reviewUrl: link,
      date: Number.isFinite(date) ? date : undefined
    })
  }
  return out
}

export async function readStereogum(): Promise<CriticAlbum[]> {
  return requireSome(parseAlbumOfTheWeek(await fetchText(FEED)), 'Stereogum').slice(0, 20)
}
