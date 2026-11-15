import type { CriticAlbum } from '@shared/types'
import { decodeEntities, fetchText, requireSome, rssItems } from './http'

const FEED = 'https://daily.bandcamp.com/feed'

export function parseAlbumOfTheDay(xml: string): CriticAlbum[] {
  const out: CriticAlbum[] = []
  for (const item of rssItems(xml)) {
    if (!/<category>\s*Album of the Day\s*<\/category>/i.test(item)) continue
    const raw = /<title>(.*?)<\/title>/s.exec(item)?.[1]
    const link = /<link>(.*?)<\/link>/s.exec(item)?.[1].trim()
    const pub = /<pubDate>(.*?)<\/pubDate>/s.exec(item)?.[1]
    if (!raw || !link?.startsWith('https://')) continue
    const title = decodeEntities(raw).trim()
    const cut = title.lastIndexOf(', “')
    if (cut < 1) continue
    const album = title.slice(cut + 3).replace(/”$/, '').trim()
    const artist = title.slice(0, cut).trim()
    if (!album || !artist) continue
    const img = /<img [^>]*?src="([^"]+)"/.exec(item)
    const date = pub ? Date.parse(pub) : NaN
    out.push({
      title: album,
      artist,
      artUrl: img ? decodeEntities(img[1]) : undefined,
      source: 'bandcamp',
      verdict: 'Album of the Day',
      reviewUrl: link,
      date: Number.isFinite(date) ? date : undefined
    })
  }
  return out
}

export async function readBandcamp(): Promise<CriticAlbum[]> {
  return requireSome(parseAlbumOfTheDay(await fetchText(FEED)), 'Bandcamp').slice(0, 20)
}
