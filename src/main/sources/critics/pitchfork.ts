import type { CriticAlbum, CriticList, CriticListSummary } from '@shared/types'
import { decodeEntities, fetchText, requireSome, rssItems } from './http'

const ORIGIN = 'https://pitchfork.com'
const strip = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, '')).trim()

export function parseBestNew(html: string): CriticAlbum[] {
  const out: CriticAlbum[] = []
  for (const chunk of html.split('<div class="SummaryItemWrapper').slice(1)) {
    const link = /summary-item__hed-link[^>]*href="(\/reviews\/albums\/[^"]+)"/.exec(chunk)
    const title = /summary-item__hed"[^>]*>(.*?)<\/h3>/s.exec(chunk)
    const artist = /summary-item__sub-hed"[^>]*>(.*?)<\/div>/s.exec(chunk)
    if (!link || !title || !artist) continue
    const t = strip(title[1])
    const a = strip(artist[1])
    if (!t || !a) continue
    const img = /<img [^>]*?src="([^"]+)"/.exec(chunk)
    out.push({
      title: t,
      artist: a,
      artUrl: img ? decodeEntities(img[1]) : undefined,
      source: 'pitchfork',
      verdict: 'Best New Music',
      reviewUrl: ORIGIN + link[1]
    })
  }
  return out
}

export function parseReviewDates(xml: string): Map<string, number> {
  const dates = new Map<string, number>()
  for (const item of rssItems(xml)) {
    const link = /<link>(.*?)<\/link>/s.exec(item)
    const pub = /<pubDate>(.*?)<\/pubDate>/s.exec(item)
    const ms = pub ? Date.parse(pub[1]) : NaN
    if (link && Number.isFinite(ms)) dates.set(link[1].trim(), ms)
  }
  return dates
}

export function parseListIndex(html: string): CriticListSummary[] {
  const slugs = new Set(
    [...html.matchAll(/\/features\/lists-and-guides\/([a-z0-9-]+)\//g)].map((m) => m[1])
  )
  const out: CriticListSummary[] = []
  for (const slug of slugs) {
    const year = /(?:^|-)((?:19|20)\d\d)(?:-|$)/.exec(slug)
    if (!year || !slug.includes('best') || !slug.includes('albums')) continue
    const title = slug
      .split('-')
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ')
    out.push({ id: `pitchfork:${slug}`, source: 'pitchfork', title, year: +year[1], ranked: true })
  }
  return out
}

export function parseList(html: string): CriticAlbum[] {
  const entries = [...html.matchAll(/<h2>([^<]*?):\s*<em>([^<]*)<\/em><\/h2>/g)]
  // the cover is the last <img> between the previous entry's heading and this one
  const arts = entries.map((m, i) => {
    const from = i ? entries[i - 1].index! + entries[i - 1][0].length : 0
    const img = [...html.slice(from, m.index).matchAll(/<img\s(?:[^>]*?\s)?src="([^"]+)"/g)].pop()
    return img ? decodeEntities(img[1]) : undefined
  })
  // ponytail: assumes the page counts down from N to 1 (true of Pitchfork's year-end lists)
  return entries.map((m, i) => ({
    title: decodeEntities(m[2]).trim(),
    artist: decodeEntities(m[1]).trim(),
    artUrl: arts[i],
    source: 'pitchfork' as const,
    verdict: '',
    reviewUrl: '',
    rank: entries.length - i
  }))
}

export async function readBestNew(): Promise<CriticAlbum[]> {
  const [html, xml] = await Promise.all([
    fetchText(`${ORIGIN}/reviews/best/albums/`),
    fetchText(`${ORIGIN}/feed/feed-album-reviews/rss`).catch(() => '') // dates are optional
  ])
  const dates = parseReviewDates(xml)
  const albums = parseBestNew(html).map((a) => ({ ...a, date: dates.get(a.reviewUrl) }))
  return requireSome(albums, 'Pitchfork').slice(0, 20)
}

export async function readListIndex(): Promise<CriticListSummary[]> {
  const html = await fetchText(`${ORIGIN}/features/lists-and-guides/`)
  const year = new Date().getFullYear()
  const genre = (l: CriticListSummary) => !/^pitchfork:best-albums-\d{4}$/.test(l.id)
  return requireSome(
    parseListIndex(html).filter((l) => l.year === year || l.year === year - 1),
    'Pitchfork lists'
  ).sort((a, b) => b.year - a.year || +genre(a) - +genre(b))
}

export async function readList(id: string): Promise<CriticList> {
  const slug = id.replace(/^pitchfork:/, '')
  const meta = parseListIndex(`/features/lists-and-guides/${slug}/`)[0]
  if (!meta) throw new Error(`Pitchfork: unknown list ${id}`)
  const url = `${ORIGIN}/features/lists-and-guides/${slug}/`
  const albums = requireSome(parseList(await fetchText(url)), 'Pitchfork list')
  return { ...meta, albums: albums.map((a) => ({ ...a, verdict: meta.title, reviewUrl: url })) }
}
