import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { parseFile } from 'music-metadata'
import type { LocalScanProgress, LocalScanResult } from '@shared/types'
import { db } from '../context'
import { getLocal, localIndex, removeLocal, upsertLocal, type LocalTrackInput } from '../db/localTracks'
import { mapLimit } from '../util/async'

/** Formats Chromium's <audio> can play. */
export const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'audio/mp4',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.webm': 'audio/webm'
}

async function listAudioFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && AUDIO_MIME[extname(e.name).toLowerCase()])
    .map((e) => join(e.parentPath, e.name))
}

/** Tags, falling back to the file and folder names when they're missing. */
async function readTags(path: string, mtime: number, size: number): Promise<LocalTrackInput> {
  const fallbackTitle = basename(path, extname(path)).replace(/^\d+[\s.\-_]+/, '')
  const base: LocalTrackInput = {
    path,
    mtime,
    size,
    title: fallbackTitle,
    artist: 'Unknown artist',
    album: basename(dirname(path)) || null,
    track_no: null,
    disc_no: null,
    year: null,
    duration: 0
  }
  try {
    const { common, format } = await parseFile(path, { skipCovers: true, duration: false })
    return {
      ...base,
      title: common.title?.trim() || fallbackTitle,
      artist: (common.artists?.join(', ') || common.artist || common.albumartist || base.artist).trim(),
      album: common.album?.trim() || base.album,
      track_no: common.track?.no ?? null,
      disc_no: common.disk?.no ?? null,
      year: common.year ?? null,
      duration: format.duration ?? 0
    }
  } catch {
    return base
  }
}

let scanning: Promise<LocalScanResult> | undefined

/** Incremental scan: only new or changed files are re-read; vanished files are dropped. */
export function scanFolder(folder: string, onProgress: (p: LocalScanProgress) => void): Promise<LocalScanResult> {
  scanning ??= (async () => {
    try {
      const files = await listAudioFiles(folder)
      const known = localIndex(db())
      const seen = new Set<string>()
      const changed: { path: string; mtime: number; size: number; isNew: boolean }[] = []

      await mapLimit(files, 16, async (path) => {
        const s = await stat(path)
        seen.add(path)
        const prev = known.get(path)
        const mtime = Math.floor(s.mtimeMs)
        if (!prev || prev.mtime !== mtime || prev.size !== s.size) changed.push({ path, mtime, size: s.size, isNew: !prev })
      })
      const removed = [...known.keys()].filter((p) => !seen.has(p))
      removeLocal(db(), removed)

      let scanned = 0
      onProgress({ scanned, total: changed.length, done: changed.length === 0 })
      const BATCH = 50
      for (let i = 0; i < changed.length; i += BATCH) {
        const batch = changed.slice(i, i + BATCH)
        const rows = await mapLimit(batch, 4, (f) => readTags(f.path, f.mtime, f.size))
        upsertLocal(db(), rows.filter((r): r is LocalTrackInput => !!r))
        scanned += batch.length
        onProgress({ scanned, total: changed.length, done: scanned >= changed.length })
      }

      const added = changed.filter((c) => c.isNew).length
      return { folder, total: seen.size, added, updated: changed.length - added, removed: removed.length }
    } finally {
      scanning = undefined
    }
  })()
  return scanning
}

/* ---------- serving files (via the tunebox-audio:// protocol) ---------- */

/** Streams a local file by its row id, honouring HTTP Range so seeking works. */
export async function serveLocalFile(rowId: number, rangeHeader: string | null): Promise<Response> {
  const row = getLocal(db(), rowId)
  if (!row) return new Response('Not found', { status: 404 })
  let size: number
  try {
    size = (await stat(row.path)).size
  } catch {
    return new Response('File is missing. Rescan your music folder.', { status: 404 })
  }
  const mime = AUDIO_MIME[extname(row.path).toLowerCase()] ?? 'application/octet-stream'
  const m = rangeHeader?.match(/bytes=(\d*)-(\d*)/)
  const start = m?.[1] ? Number(m[1]) : 0
  const end = m?.[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  if (start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })

  const body = Readable.toWeb(createReadStream(row.path, { start, end })) as ReadableStream<Uint8Array>
  return new Response(body, {
    status: m ? 206 : 200,
    headers: {
      'content-type': mime,
      'content-length': String(end - start + 1),
      'accept-ranges': 'bytes',
      ...(m ? { 'content-range': `bytes ${start}-${end}/${size}` } : {})
    }
  })
}

const artCache = new Map<number, { data: Uint8Array; type: string } | null>()

/** Embedded cover art, or 404 so the UI shows its placeholder. */
export async function serveLocalArt(rowId: number): Promise<Response> {
  let art = artCache.get(rowId)
  if (art === undefined) {
    const row = getLocal(db(), rowId)
    art = null
    if (row) {
      try {
        const { common } = await parseFile(row.path, { duration: false })
        const pic = common.picture?.[0]
        if (pic) art = { data: pic.data, type: pic.format || 'image/jpeg' }
      } catch {
        /* unreadable file: no art */
      }
    }
    artCache.set(rowId, art)
    if (artCache.size > 300) artCache.delete(artCache.keys().next().value!)
  }
  if (!art) return new Response(null, { status: 404 })
  return new Response(Buffer.from(art.data), { headers: { 'content-type': art.type, 'cache-control': 'max-age=86400' } })
}
