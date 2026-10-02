import { protocol } from 'electron'
import { AUDIO_SCHEME } from '@shared/api'
import { db } from '../context'
import { getSettings } from '../db/settings'
import { serveLocalArt, serveLocalFile } from '../local/library'
import { invalidateStream, resolveStream, type ResolvedStream } from './resolver'

/** Must run before `app.ready`. */
export function registerAudioScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: AUDIO_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

/** googlevideo rejects large single range requests, so the proxy fetches in chunks. */
const CHUNK = 512 * 1024

function parseRange(header: string | null): { start: number; end?: number } {
  const m = header?.match(/bytes=(\d*)-(\d*)/)
  if (!m || m[1] === '') return { start: 0 }
  return { start: Number(m[1]), end: m[2] ? Number(m[2]) : undefined }
}

// Node's fetch, not net.fetch: googlevideo rejects Chromium's request fingerprint with 403.
const fetchChunk = (s: ResolvedStream, from: number, to: number, signal: AbortSignal) =>
  fetch(s.url, { headers: { ...s.headers, Range: `bytes=${from}-${to}` }, signal })

/**
 * The equalizer routes <audio> through Web Audio, which outputs silence for
 * cross-origin media unless the response allows CORS.
 */
function withCors(res: Response): Response {
  res.headers.set('access-control-allow-origin', '*')
  res.headers.set('access-control-expose-headers', 'content-length, content-range, accept-ranges')
  return res
}

/**
 * `tunebox-audio://local/<rowId>` and `tunebox-audio://localart/<rowId>` serve files
 * from the user's music folder by database id.
 *
 * `tunebox-audio://track/<videoId>` proxies the YouTube audio stream. The requested
 * range is served as a sequence of small upstream chunks, so seeking works. An
 * expired or rejected URL is re-resolved once.
 */
export function handleAudioProtocol(): void {
  protocol.handle(AUDIO_SCHEME, async (request) => withCors(await handle(request)))
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const ref = url.pathname.replace(/^\//, '')
  if (url.hostname === 'local' || url.hostname === 'localart') {
    const rowId = Number(ref)
    if (!Number.isInteger(rowId) || rowId <= 0) return new Response('Bad id', { status: 400 })
    return url.hostname === 'local' ? serveLocalFile(rowId, request.headers.get('range')) : serveLocalArt(rowId)
  }
  const videoId = ref
  if (!/^[\w-]{11}$/.test(videoId)) return new Response('Bad video id', { status: 400 })
  const { start, end } = parseRange(request.headers.get('range'))
  const quality = getSettings(db()).audioQuality
  const signal = request.signal

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const stream = await resolveStream(videoId, { quality, force: attempt > 0 })
      const first = await fetchChunk(stream, start, end !== undefined ? Math.min(end, start + CHUNK - 1) : start + CHUNK - 1, signal)
      if (first.status === 416) return new Response(null, { status: 416 })
      if (first.status !== 206) {
        await first.body?.cancel()
        invalidateStream(videoId)
        if (attempt === 0) continue
        return new Response(`Upstream HTTP ${first.status}`, { status: 502 })
      }

      const total = Number(first.headers.get('content-range')?.split('/')[1])
      const last = Math.min(end ?? total - 1, total - 1)
      let pos = start + Number(first.headers.get('content-length') ?? 0)
      let reader = first.body!.getReader()

      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            for (;;) {
              const { done, value } = await reader.read()
              if (!done) {
                controller.enqueue(value)
                return
              }
              if (pos > last) {
                controller.close()
                return
              }
              const next = await fetchChunk(stream, pos, Math.min(pos + CHUNK - 1, last), signal)
              if (next.status !== 206) throw new Error(`Upstream HTTP ${next.status} at byte ${pos}`)
              pos += Number(next.headers.get('content-length') ?? 0)
              reader = next.body!.getReader()
            }
          } catch (err) {
            if (!signal.aborted) {
              console.error('[audio]', videoId, (err as Error).message)
              invalidateStream(videoId)
            }
            controller.error(err)
          }
        },
        cancel() {
          void reader.cancel()
        }
      })

      return new Response(body, {
        status: 206,
        headers: {
          'content-type': first.headers.get('content-type')?.startsWith('audio/') ? first.headers.get('content-type')! : stream.mime,
          'content-length': String(last - start + 1),
          'content-range': `bytes ${start}-${last}/${total}`,
          'accept-ranges': 'bytes',
          'cache-control': 'no-store'
        }
      })
    }
    return new Response('Stream unavailable', { status: 502 })
  } catch (err) {
    if (signal.aborted) return new Response(null, { status: 499 })
    console.error('[audio]', videoId, (err as Error).message)
    return new Response((err as Error).message, { status: 502 })
  }
}
