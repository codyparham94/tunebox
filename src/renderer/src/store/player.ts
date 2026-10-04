import { create } from 'zustand'
import { audioUrl } from '@shared/api'
import type { DiscoverFeed, RadioTrack, Settings, Station, Track } from '@shared/types'
import { api, errorMessage, invalidateLikes, keys, queryClient } from '../lib/queries'
import { connectEq } from '../lib/eqEngine'
import { toast } from './toast'

export interface QueueItem extends RadioTrack {
  /** unique per queue entry, so the same song can appear twice */
  qid: number
}

export type Repeat = 'off' | 'all' | 'one'

interface PlayerState {
  queue: QueueItem[]
  index: number
  playing: boolean
  loading: boolean
  position: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: Repeat
  station: { id: number; name: string } | null
  refilling: boolean
  /** this session's thumbs, by videoId, for button state */
  thumbs: Record<string, 1 | -1>
}

export const usePlayer = create<PlayerState>(() => ({
  queue: [],
  index: -1,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  station: null,
  refilling: false,
  thumbs: {}
}))

const get = usePlayer.getState
const set = usePlayer.setState

export const currentTrack = (s: PlayerState = get()): QueueItem | undefined => s.queue[s.index]

/* ---------- audio engine ---------- */

const audio = new Audio()
audio.preload = 'auto'
// Needed for the equalizer: Web Audio only processes CORS-enabled media.
audio.crossOrigin = 'anonymous'

type EndKind = 'ended' | 'skip' | 'replace' | 'dislike'

let qidSeq = 1
let session: { qid: number; track: QueueItem; listenedMs: number; last: number } | null = null
let errorStreak = 0
let advanceAfterRefill = false
let unshuffled: QueueItem[] | null = null

const withQid = (t: Track | RadioTrack): QueueItem => ({ ...t, qid: qidSeq++ })
const primaryArtist = (artist: string) => artist.split(',')[0].trim().toLowerCase()

function plain(t: QueueItem): Track {
  const { id, title, artist, artistId, album, albumId, duration, artUrl } = t
  return { id, title, artist, artistId, album, albumId, duration, artUrl }
}

/** Report the finished play so history and the radio model learn from it. */
function finalize(kind: EndKind): void {
  const s = session
  session = null
  if (!s || kind === 'dislike') return
  const dur = s.track.duration || audio.duration || 0
  const completed = kind === 'ended' || (dur > 0 && s.listenedMs >= dur * 900)
  const skipped = kind === 'skip' && !completed
  if (!completed && !skipped && s.listenedMs < 5000) return
  void api.library
    .recordPlay({ track: plain(s.track), listenedMs: s.listenedMs, completed, skipped, stationId: get().station?.id ?? null })
    .then(() => queryClient.invalidateQueries({ queryKey: keys.history }))
    .catch(() => undefined)
}

async function startAt(i: number, kind: EndKind = 'replace'): Promise<void> {
  const item = get().queue[i]
  if (!item) return
  finalize(kind)
  set({ index: i, position: 0, duration: item.duration || 0, loading: true })

  let track = item
  if (!track.id) {
    const match = await api.catalog.match(plain(item)).catch(() => null)
    if (currentTrack()?.qid !== item.qid) return // user moved on
    if (!match) {
      toast.error(`Couldn’t find “${item.title}” on YouTube. Skipping.`)
      return next('replace')
    }
    track = { ...match, artUrl: item.artUrl ?? match.artUrl, reason: item.reason, qid: item.qid }
    set({ queue: get().queue.map((q) => (q.qid === item.qid ? track : q)) })
  }

  session = { qid: track.qid, track, listenedMs: 0, last: 0 }
  audio.src = audioUrl(track.id)
  connectEq(audio)
  updateMediaSession(track)
  try {
    await audio.play()
  } catch (err) {
    if ((err as Error).name !== 'AbortError') console.warn('[player] play failed', err)
  }
  afterStart()
}

function afterStart(): void {
  const s = get()
  const upcoming = s.queue[s.index + 1]
  if (upcoming?.id) void api.system.prefetch(upcoming.id)
  void refillStation()
  void refillAutoplay()
  reportNowPlaying()
}

async function refillStation(): Promise<void> {
  const s = get()
  if (!s.station || s.refilling || s.queue.length - s.index - 1 >= 3) return
  const stationId = s.station.id
  set({ refilling: true })
  try {
    const tracks = await api.radio.next(stationId, 5)
    if (get().station?.id !== stationId) return
    if (tracks.length === 0) toast.info('This station ran out of new songs for now.')
    appendRefill(tracks)
  } catch (err) {
    advanceAfterRefill = false
    set({ loading: false })
    toast.error(errorMessage(err))
  } finally {
    set({ refilling: false })
  }
}

/** Adds refill picks to the end of the queue, starting them if playback was waiting on them. */
function appendRefill(tracks: RadioTrack[]): void {
  const start = get().queue.length
  set({ queue: [...get().queue, ...tracks.map(withQid)] })
  if (advanceAfterRefill) {
    advanceAfterRefill = false
    if (tracks.length) return void startAt(start, 'replace')
    set({ loading: false })
  }
  const nextUp = get().queue[get().index + 1]
  if (nextUp?.id) void api.system.prefetch(nextUp.id)
}

/* ---------- autoplay: keep going with Discover picks when the queue runs out ---------- */

const AUTOPLAY_BATCH = 10

const autoplayOn = (): boolean => queryClient.getQueryData<Settings>(keys.settings)?.autoplay ?? true
const songKey = (t: Track): string => `${t.title.toLowerCase()}|${primaryArtist(t.artist)}`

/** Only outside stations, with repeat off, once the last queued song is playing. */
function autoplayDue(s: PlayerState = get()): boolean {
  return !s.station && s.repeat === 'off' && autoplayOn() && s.queue.length > 0 && s.index >= s.queue.length - 1
}

async function refillAutoplay(): Promise<void> {
  const s = get()
  if (s.refilling || !autoplayDue(s)) return
  const anchor = currentTrack(s)?.qid ?? s.queue[s.queue.length - 1].qid
  set({ refilling: true })
  try {
    const tracks = await autoplayPicks(s.queue)
    // The user started something else meanwhile.
    if (get().station || !get().queue.some((q) => q.qid === anchor)) return
    if (tracks.length === 0) toast.info('Autoplay couldn’t find more songs right now.')
    appendRefill(tracks)
  } catch (err) {
    advanceAfterRefill = false
    set({ loading: false })
    toast.error(errorMessage(err))
  } finally {
    set({ refilling: false })
  }
}

/** Discover's mix and shelves, skipping anything already in the queue; today's charts as a last resort. */
async function autoplayPicks(queue: QueueItem[]): Promise<RadioTrack[]> {
  const seen = new Set(queue.flatMap((q) => (q.id ? [q.id, songKey(q)] : [songKey(q)])))
  const fresh = <T extends Track>(ts: T[]): T[] => ts.filter((t) => !(t.id && seen.has(t.id)) && !seen.has(songKey(t)))
  const fromFeed = (feed: DiscoverFeed): RadioTrack[] => [
    ...shuffled(fresh(feed.mix)),
    ...shuffled(fresh(feed.shelves.flatMap((sh) => sh.tracks)))
  ]

  let feed = await api.discover.feed(false)
  let picks = fromFeed(feed)
  const total = Object.values(feed.signals).reduce((a, b) => a + b, 0)
  if (picks.length < AUTOPLAY_BATCH && total > 0) {
    // Used up the cached picks: build a fresh set.
    feed = await api.discover.feed(true)
    queryClient.setQueryData(['discover', 'feed'], feed)
    picks = fromFeed(feed)
  }
  if (picks.length === 0) {
    const charts = await api.catalog.charts(undefined, 50).catch(() => [] as Track[])
    picks = shuffled(fresh(charts)).map((t) => ({ ...t, reason: 'Popular right now' }))
  }
  const unique = new Set<string>()
  return picks
    .filter((t) => !unique.has(songKey(t)) && !!unique.add(songKey(t)))
    .slice(0, AUTOPLAY_BATCH)
    .map((t) => ({ ...t, reason: t.reason ? `Autoplay · ${t.reason}` : 'Autoplay' }))
}

audio.addEventListener('play', () => {
  set({ playing: true })
  reportNowPlaying()
})
audio.addEventListener('pause', () => {
  set({ playing: false })
  reportNowPlaying()
})
audio.addEventListener('playing', () => {
  errorStreak = 0
  set({ loading: false })
})
audio.addEventListener('waiting', () => set({ loading: true }))
audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration)) set({ duration: audio.duration })
})
audio.addEventListener('seeked', () => {
  if (session) session.last = audio.currentTime
})
audio.addEventListener('timeupdate', () => {
  const t = audio.currentTime
  if (session && !audio.paused) {
    const delta = t - session.last
    if (delta > 0 && delta < 2) session.listenedMs += delta * 1000
    session.last = t
  }
  set({ position: t })
  updatePositionState()
})
audio.addEventListener('ended', () => next('ended'))
audio.addEventListener('error', () => {
  if (!audio.src || !session) return
  const t = currentTrack()
  errorStreak++
  set({ loading: false, playing: false })
  if (errorStreak >= 3) {
    toast.error('Playback keeps failing. Check Settings → Playback engine.')
    return
  }
  toast.error(`Couldn’t play “${t?.title ?? 'this track'}”. Skipping.`)
  setTimeout(() => next('replace'), 600)
})
window.addEventListener('beforeunload', () => finalize('replace'))

/* ---------- media session (Windows media flyout + hardware keys) ---------- */

function updateMediaSession(t: Track): void {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    album: t.album ?? '',
    artwork: t.artUrl ? [{ src: t.artUrl, sizes: '512x512' }] : []
  })
}

let lastPositionUpdate = 0
function updatePositionState(): void {
  if (!('mediaSession' in navigator) || Date.now() - lastPositionUpdate < 1000) return
  lastPositionUpdate = Date.now()
  const duration = audio.duration
  if (!Number.isFinite(duration) || duration <= 0) return
  try {
    navigator.mediaSession.setPositionState({ duration, position: Math.min(audio.currentTime, duration), playbackRate: 1 })
  } catch {
    /* position briefly out of range while seeking */
  }
}

function reportNowPlaying(): void {
  const s = get()
  const t = currentTrack(s)
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = s.playing ? 'playing' : 'paused'
  void api.system.nowPlaying({ title: t?.title, artist: t?.artist, playing: s.playing, inStation: !!s.station })
}

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession
  ms.setActionHandler('play', () => player.toggle())
  ms.setActionHandler('pause', () => player.toggle())
  ms.setActionHandler('nexttrack', () => player.next())
  ms.setActionHandler('previoustrack', () => player.prev())
  ms.setActionHandler('seekto', (d) => d.seekTime !== undefined && player.seek(d.seekTime))
  ms.setActionHandler('seekbackward', () => player.seekBy(-10))
  ms.setActionHandler('seekforward', () => player.seekBy(10))
}

/* ---------- queue navigation ---------- */

function next(kind: EndKind = 'skip'): void {
  const s = get()
  if (kind === 'ended' && s.repeat === 'one') {
    finalize('ended')
    const t = currentTrack()
    if (t) session = { qid: t.qid, track: t, listenedMs: 0, last: 0 }
    audio.currentTime = 0
    void audio.play()
    return
  }
  let i = s.index + 1
  if (i >= s.queue.length) {
    if (s.station) {
      finalize(kind)
      advanceAfterRefill = true
      audio.pause()
      set({ loading: true })
      void refillStation()
      return
    }
    if (s.repeat === 'all' && s.queue.length > 0) i = 0
    else if (autoplayDue(s)) {
      finalize(kind)
      advanceAfterRefill = true
      audio.pause()
      set({ loading: true })
      // Usually already queued while the last song played; this covers a failed or skipped-past refill.
      void refillAutoplay()
      return
    } else {
      finalize(kind)
      audio.pause()
      audio.currentTime = 0
      return
    }
  }
  void startAt(i, kind)
}

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ---------- public actions ---------- */

export const player = {
  /** Replace the queue and start playing. Leaves any station unless one is given. */
  playList(tracks: Track[], start = 0, opts: { shuffle?: boolean } = {}): void {
    if (tracks.length === 0) return
    let items = tracks.map(withQid)
    let index = Math.max(0, Math.min(start, items.length - 1))
    const doShuffle = opts.shuffle ?? get().shuffle
    unshuffled = null
    if (doShuffle) {
      unshuffled = items
      const first = opts.shuffle ? items[Math.floor(Math.random() * items.length)] : items[index]
      items = [first, ...shuffled(items.filter((x) => x !== first))]
      index = 0
    }
    advanceAfterRefill = false
    set({ queue: items, station: null, shuffle: doShuffle })
    void startAt(index, 'replace')
  },

  /** Tune into a station. A seed track plays first while the station fills up. */
  playStation(station: Station, seed?: Track): void {
    unshuffled = null
    set({ queue: seed ? [withQid(seed)] : [], index: -1, station: { id: station.id, name: station.name }, shuffle: false })
    if (seed) void startAt(0, 'replace')
    else {
      finalize('replace')
      audio.pause()
      advanceAfterRefill = true
      set({ loading: true })
      void refillStation()
    }
    void queryClient.invalidateQueries({ queryKey: keys.stations })
  },

  /** The playing station's artists changed: swap its queued picks for fresh ones. */
  retuneStation(stationId: number): void {
    const s = get()
    if (s.station?.id !== stationId) return
    const kept = s.queue.filter((item, i) => i <= s.index || !item.reason)
    set({ queue: kept })
    void refillStation()
  },

  leaveStation(): void {
    advanceAfterRefill = false
    set({ station: null })
    reportNowPlaying()
  },

  enqueue(tracks: Track[]): void {
    if (tracks.length === 0) return
    const wasEmpty = get().index < 0
    set({ queue: [...get().queue, ...tracks.map(withQid)] })
    if (wasEmpty) void startAt(0, 'replace')
    toast.info(tracks.length === 1 ? `Added “${tracks[0].title}” to the queue` : `Added ${tracks.length} songs to the queue`)
  },

  playNext(tracks: Track[]): void {
    if (tracks.length === 0) return
    const { queue, index } = get()
    if (index < 0) return player.playList(tracks)
    set({ queue: [...queue.slice(0, index + 1), ...tracks.map(withQid), ...queue.slice(index + 1)] })
    toast.info(tracks.length === 1 ? `“${tracks[0].title}” will play next` : `${tracks.length} songs will play next`)
  },

  jumpTo(i: number): void {
    void startAt(i, 'replace')
  },

  removeAt(i: number): void {
    const { queue, index } = get()
    if (i === index || !queue[i]) return
    set({ queue: queue.filter((_, j) => j !== i), index: i < index ? index - 1 : index })
  },

  move(from: number, to: number): void {
    const { queue, index } = get()
    if (from === to || !queue[from] || !queue[to]) return
    const currentQid = queue[index]?.qid
    const q = [...queue]
    const [moved] = q.splice(from, 1)
    q.splice(to, 0, moved)
    set({ queue: q, index: q.findIndex((x) => x.qid === currentQid) })
  },

  clearUpcoming(): void {
    const { queue, index } = get()
    set({ queue: queue.slice(0, index + 1) })
  },

  toggle(): void {
    const s = get()
    if (!currentTrack(s)) {
      if (s.queue.length) void startAt(Math.max(0, s.index), 'replace')
      return
    }
    if (!audio.src || audio.error) void startAt(s.index, 'replace')
    else if (audio.paused) void audio.play()
    else audio.pause()
  },

  next(): void {
    next('skip')
  },

  prev(): void {
    const { index } = get()
    if (audio.currentTime > 3 || index <= 0) {
      audio.currentTime = 0
      return
    }
    void startAt(index - 1, 'replace')
  },

  seek(seconds: number): void {
    if (!Number.isFinite(audio.duration)) return
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration - 0.5))
    set({ position: audio.currentTime })
  },

  seekBy(delta: number): void {
    player.seek(audio.currentTime + delta)
  },

  setVolume(v: number, persist = true): void {
    const volume = Math.max(0, Math.min(1, v))
    audio.volume = volume
    audio.muted = false
    set({ volume, muted: false })
    if (persist) persistVolume(volume)
  },

  toggleMute(): void {
    audio.muted = !audio.muted
    set({ muted: audio.muted })
  },

  toggleShuffle(): void {
    const { queue, index, shuffle } = get()
    const head = queue.slice(0, index + 1)
    if (!shuffle) {
      unshuffled = queue
      set({ shuffle: true, queue: [...head, ...shuffled(queue.slice(index + 1))] })
      return
    }
    const present = new Set(queue.map((q) => q.qid))
    const original = (unshuffled ?? queue).filter((q) => present.has(q.qid))
    const known = new Set(original.map((q) => q.qid))
    const restored = [...original, ...queue.filter((q) => !known.has(q.qid))]
    const currentQid = queue[index]?.qid
    unshuffled = null
    set({ shuffle: false, queue: restored, index: restored.findIndex((q) => q.qid === currentQid) })
  },

  cycleRepeat(): void {
    const order: Repeat[] = ['off', 'all', 'one']
    set({ repeat: order[(order.indexOf(get().repeat) + 1) % order.length] })
  },

  /** 👍 / 👎. Thumbs down skips immediately; in a station it also drops that artist's queued songs. */
  thumb(value: 1 | -1): void {
    const t = currentTrack()
    if (!t?.id) return
    const station = get().station
    set({ thumbs: { ...get().thumbs, [t.id]: value } })
    void api.radio
      .feedback(station?.id ?? null, plain(t), value)
      .then(invalidateLikes)
      .catch((err) => toast.error(errorMessage(err)))
    if (value === 1) return
    if (station) {
      const artist = primaryArtist(t.artist)
      const { queue, index } = get()
      set({ queue: [...queue.slice(0, index + 1), ...queue.slice(index + 1).filter((q) => primaryArtist(q.artist) !== artist)] })
      toast.info(`Got it. Less ${t.artist.split(',')[0]} on this station.`)
    }
    next('dislike')
  }
}

let volumeTimer: ReturnType<typeof setTimeout> | undefined
function persistVolume(volume: number): void {
  clearTimeout(volumeTimer)
  volumeTimer = setTimeout(() => void api.settings.set({ volume }), 500)
}

export function initPlayer(volume: number): void {
  player.setVolume(volume, false)
}
