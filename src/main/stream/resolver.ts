import type { AudioQuality } from '@shared/types'
import { innertube, resetInnertube } from '../sources/ytmusic'
import { ytdlpResolve } from './ytdlp'

export interface ResolvedStream {
  url: string
  mime: string
  headers: Record<string, string>
  expiresAt: number
  via: 'youtubei' | 'yt-dlp'
}

/**
 * Clients tried in order. Without a PO token, some clients' URLs only serve the first
 * ~1 MB (later ranges 403), and which ones depends on the video, so every URL is
 * checked with `servesWholeFile` before it is used.
 */
const CLIENTS = ['IOS', 'VISIONOS', 'YTMUSIC', 'MWEB'] as const
const SAFETY_MS = 5 * 60 * 1000

const cache = new Map<string, ResolvedStream>()
const inflight = new Map<string, Promise<ResolvedStream>>()

function expiryOf(url: string): number {
  const expire = Number(new URL(url).searchParams.get('expire'))
  return expire ? expire * 1000 - SAFETY_MS : Date.now() + 3 * 60 * 60 * 1000
}

/** Reads the last KB of the file. A 206 means the URL isn't capped to the first chunk. */
export async function servesWholeFile(url: string, headers: Record<string, string> = {}, length?: number): Promise<boolean> {
  let size = length
  if (!size) {
    const head = await fetch(url, { headers: { ...headers, Range: 'bytes=0-0' } })
    await head.body?.cancel()
    size = Number(head.headers.get('content-range')?.split('/')[1])
    if (head.status !== 206 || !size) return false
  }
  const tail = await fetch(url, { headers: { ...headers, Range: `bytes=${Math.max(0, size - 1024)}-${size - 1}` } })
  await tail.body?.cancel()
  return tail.status === 206
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function resolveWithYoutubei(videoId: string, quality: AudioQuality): Promise<ResolvedStream> {
  const yt = await innertube()
  const errors: string[] = []
  for (const client of CLIENTS) {
    try {
      const info = await yt.getBasicInfo(videoId, { client })
      const audio = (info.streaming_data?.adaptive_formats ?? []).filter((f: any) => f.has_audio && !f.has_video)
      if (audio.length === 0) throw new Error('no audio formats')
      audio.sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
      const format = quality === 'low' ? audio[audio.length - 1] : audio[0]
      const url = await format.decipher(yt.session.player)
      if (!url) throw new Error('empty stream URL')
      if (!(await servesWholeFile(url, {}, Number(format.content_length) || undefined))) {
        throw new Error('URL is capped (needs a PO token)')
      }
      return {
        url,
        mime: String(format.mime_type).split(';')[0] || 'audio/mp4',
        headers: {},
        expiresAt: expiryOf(url),
        via: 'youtubei'
      }
    } catch (err) {
      errors.push(`${client}: ${(err as Error).message}`)
    }
  }
  throw new Error(errors.join('; '))
}

export async function resolveWithYtdlp(videoId: string, quality: AudioQuality): Promise<ResolvedStream> {
  const s = await ytdlpResolve(videoId, quality)
  return { ...s, expiresAt: expiryOf(s.url), via: 'yt-dlp' }
}

/**
 * Circuit breaker: after a run of youtubei.js misses, try yt-dlp first for a while
 * instead of paying for four failed client attempts before every song.
 */
const BREAKER_THRESHOLD = 3
const BREAKER_MS = 15 * 60 * 1000
let youtubeiFailures = 0
let ytdlpFirstUntil = 0

async function youtubeiTracked(videoId: string, quality: AudioQuality): Promise<ResolvedStream> {
  try {
    const s = await resolveWithYoutubei(videoId, quality)
    youtubeiFailures = 0
    return s
  } catch (err) {
    if (++youtubeiFailures >= BREAKER_THRESHOLD) {
      youtubeiFailures = 0
      ytdlpFirstUntil = Date.now() + BREAKER_MS
      resetInnertube() // a stale session is one possible cause
    }
    throw err
  }
}

export function resolveStream(
  videoId: string,
  opts: { quality: AudioQuality; force?: boolean }
): Promise<ResolvedStream> {
  const hit = cache.get(videoId)
  if (!opts.force && hit && hit.expiresAt > Date.now()) return Promise.resolve(hit)
  const pending = inflight.get(videoId)
  if (pending) return pending

  const resolvers = [
    { name: 'youtubei.js', run: () => youtubeiTracked(videoId, opts.quality) },
    { name: 'yt-dlp', run: () => resolveWithYtdlp(videoId, opts.quality) }
  ]
  if (Date.now() < ytdlpFirstUntil) resolvers.reverse()

  const job = (async () => {
    const errors: string[] = []
    for (const r of resolvers) {
      try {
        return await r.run()
      } catch (err) {
        errors.push(`${r.name}: ${(err as Error).message}`)
      }
    }
    throw new Error(`Could not resolve ${videoId}. ${errors.join('. ')}`)
  })()
    .then((s) => {
      cache.set(videoId, s)
      if (cache.size > 200) cache.delete(cache.keys().next().value!)
      return s
    })
    .finally(() => inflight.delete(videoId))

  inflight.set(videoId, job)
  return job
}

export function invalidateStream(videoId: string): void {
  cache.delete(videoId)
}
