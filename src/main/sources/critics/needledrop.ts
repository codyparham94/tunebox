import type { CriticAlbum, CriticList } from '@shared/types'
import { mapLimit } from '../../util/async'
import { channelVideo } from '../ytmusic'
import { decodeEntities, fetchText, requireSome } from './http'

const ORIGIN = 'https://www.theneedledrop.com'
export const NEEDLEDROP_CHANNEL = 'UCt7fwAhXDy3oNFTAzF2o8Pw'

type Seen = Record<string, { album: CriticAlbum; score: number } | null>

const splitName = (s: string): { artist: string; title: string } | undefined => {
  const i = s.indexOf(' - ')
  const artist = s.slice(0, i).trim()
  const title = s.slice(i + 3).trim()
  return i > 0 && artist && title ? { artist, title } : undefined
}

export function parseReviewIndex(html: string): string[] {
  const urls = [...html.matchAll(/href="(?:https:\/\/(?:www\.)?theneedledrop\.com)?(\/album-reviews\/[^"/]+-album-review-[^"/]+\/)"/g)]
  return [...new Set(urls.map((m) => ORIGIN + m[1]))]
}

export function parseReview(html: string, url: string): { album: CriticAlbum; score: number } | null {
  const title = /<title>([^<]*)<\/title>/.exec(html)
  const name = title && splitName(decodeEntities(title[1]))
  // the verdict is the "N/10" article tag; the same text also appears in other metadata
  const score = /<meta property="article:tag" content="(\d{1,2})\/10"/.exec(html)
  if (!name || !score) return null
  const published = /<meta property="article:published_time" content="([^"]+)"/.exec(html)
  const date = published ? Date.parse(published[1]) : NaN
  return {
    album: {
      ...name,
      source: 'needledrop',
      verdict: `${score[1]}/10`,
      reviewUrl: url,
      date: Number.isFinite(date) ? date : undefined
    },
    score: +score[1]
  }
}

export function parseTop50(description: string, year: number): CriticAlbum[] {
  const lines = description.split('\n').map((l) => l.trim())
  const out: CriticAlbum[] = []
  lines.forEach((line, i) => {
    if (!line || line.includes('://')) return
    const url = lines.slice(i + 1).find(Boolean)
    const name = splitName(line)
    if (!name || !url || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) return
    out.push({ ...name, source: 'needledrop', verdict: `Top 50 of ${year}`, reviewUrl: url })
  })
  return out
}

export async function readReviews(seen: Seen): Promise<{ albums: CriticAlbum[]; seen: Seen }> {
  const urls: string[] = []
  for (let page = 1; page <= 3 && urls.length < 24; page++) {
    let found: string[]
    try {
      found = parseReviewIndex(await fetchText(`${ORIGIN}/album-reviews/${page > 1 ? `page/${page}/` : ''}`))
    } catch (err) {
      if (page === 1) throw err // page 1 down means the reader failed; later pages just end pagination
      break
    }
    if (page === 1) requireSome(found, 'The Needle Drop')
    urls.push(...found.filter((u) => !urls.includes(u)))
    if (found.some((u) => u in seen)) break // older reviews were handled by an earlier scan
  }
  urls.length = Math.min(urls.length, 24)
  const next: Seen = { ...seen }
  const fresh = urls.filter((u) => !(u in seen))
  const got = await mapLimit(fresh, 4, async (u) => parseReview(await fetchText(u), u))
  // a failed fetch (undefined) is left out so the next scan retries it
  fresh.forEach((u, i) => {
    if (got[i] !== undefined) next[u] = got[i]!
  })
  const albums = urls
    .map((u) => next[u])
    .filter((r) => r && r.score >= 8)
    .map((r) => r!.album)
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
    .slice(0, 20)
  return { albums, seen: next }
}

export async function readTop50Lists(years: number[]): Promise<CriticList[]> {
  const lists: CriticList[] = []
  for (const year of years) {
    const v = await channelVideo(NEEDLEDROP_CHANNEL, `theneedledrop top 50 albums of ${year}`, new RegExp(`top 50 albums of ${year}`, 'i'))
    const albums = v ? parseTop50(v.description, year) : []
    if (!albums.length) continue
    lists.push({
      id: `needledrop:top50-${year}`,
      source: 'needledrop',
      title: `Top 50 Albums of ${year}`,
      year,
      ranked: false,
      albums
    })
  }
  return requireSome(lists, 'The Needle Drop lists')
}
