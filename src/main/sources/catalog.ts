import type { Track } from '@shared/types'
import { db } from '../context'
import { getMatch, getTrack, putMatch, upsertTrack } from '../db/tracks'
import { matchTrack, type MatchResult } from './matcher'
import { searchSongs } from './ytmusic'

/** Resolve a metadata-only track to a playable one. Tracks with an id pass through. */
export async function resolveMatch(meta: Track): Promise<MatchResult | null> {
  if (meta.id) return { track: meta, confidence: 1 }
  const result = await matchTrack(meta, {
    search: (q) => searchSongs(q, 8).then((ts) => ts.map((t) => ({ ...t, kind: 'song' as const }))),
    cacheGet: (k) => getMatch(db(), k),
    cachePut: (k, e) => putMatch(db(), k, e),
    lookup: (id) => getTrack(db(), id)
  })
  if (result) upsertTrack(db(), result.track)
  return result
}
