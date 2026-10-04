/**
 * Dev-only datasets for the break-ui lab (#/lab?data=worst). Shaped exactly like what the
 * main process returns, so they enter through the same boundary as real data:
 * the TanStack Query cache and the player store.
 */
import type { AlbumSummary, ArtistSummary, DiscoverFeed, HistoryEntry, LocalPlaylist, RadioTrack, Station } from '@shared/types'

export type DatasetName = 'demo' | 'worst' | 'empty' | 'one' | 'huge'

export interface Dataset {
  tracks: RadioTrack[]
  history: HistoryEntry[]
  stations: Station[]
  playlists: LocalPlaylist[]
  albums: AlbumSummary[]
  artists: ArtistSummary[]
  mix: RadioTrack[]
  /** index of the playing track in `tracks`, or -1 */
  playing: number
  station: { id: number; name: string } | null
  position: number
  likedIds: string[]
}

const MIN = 60_000
const DAY = 86_400_000
const now = Date.now()

/** Solid-colour square cover, inline so the fixture never hits the network. */
function cover(hue: number, w = 300, h = 300): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 60% 38%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/* ---------- demo: the kind data the design was drawn against ---------- */

const demoTracks: RadioTrack[] = [
  { id: 'demo1', title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming', duration: 243, artUrl: cover(260) },
  { id: 'demo2', title: 'Dreams', artist: 'Fleetwood Mac', album: 'Rumours', duration: 257, artUrl: cover(20) },
  { id: 'demo3', title: 'Redbone', artist: 'Childish Gambino', album: 'Awaken, My Love!', duration: 327, artUrl: cover(120) },
  { id: 'demo4', title: 'Electric Feel', artist: 'MGMT', album: 'Oracular Spectacular', duration: 229, artUrl: cover(200) },
  { id: 'demo5', title: 'Holocene', artist: 'Bon Iver', album: 'Bon Iver, Bon Iver', duration: 337, artUrl: cover(160) },
  { id: 'demo6', title: 'Nights', artist: 'Frank Ocean', album: 'Blonde', duration: 307, artUrl: cover(320) }
]

const demo: Dataset = {
  tracks: demoTracks,
  history: demoTracks.map((track, i) => ({ track, playedAt: now - (i + 1) * 17 * MIN })),
  stations: [
    { id: 1, seedType: 'artist', seedRef: 'M83', name: 'M83 radio', artUrl: cover(260), createdAt: now, artists: [] },
    { id: 2, seedType: 'tag', seedRef: 'indie', name: 'Indie radio', artUrl: cover(40), createdAt: now, artists: [] },
    { id: 3, seedType: 'track', seedRef: 'demo3', name: 'Redbone radio', artUrl: cover(120), createdAt: now, artists: [] }
  ],
  playlists: [
    { id: 1, name: 'Road trip', trackCount: 24, artUrl: cover(30), createdAt: now },
    { id: 2, name: 'Focus', trackCount: 12, artUrl: cover(190), createdAt: now },
    { id: 3, name: 'Sunday', trackCount: 18, artUrl: cover(90), createdAt: now }
  ],
  albums: [
    { id: 'a1', title: 'Rumours', artist: 'Fleetwood Mac', year: '1977', artUrl: cover(20) },
    { id: 'a2', title: 'Blonde', artist: 'Frank Ocean', year: '2016', artUrl: cover(320) },
    { id: 'a3', title: 'In Rainbows', artist: 'Radiohead', year: '2007', artUrl: cover(10) }
  ],
  artists: [
    { id: 'r1', name: 'Radiohead', subtitle: 'Artist', artUrl: cover(10) },
    { id: 'r2', name: 'Phoebe Bridgers', subtitle: 'Artist', artUrl: cover(230) }
  ],
  mix: demoTracks.slice(0, 4).map((t) => ({ ...t, reason: 'Because you liked Fleetwood Mac' })),
  playing: 0,
  station: null,
  position: 72,
  likedIds: ['demo2']
}

/* ---------- worst case: real catalog shapes, one failure per row ---------- */

const worstTracks: RadioTrack[] = [
  {
    // real Sufjan Stevens title; 200+ chars with commas and quotes
    id: 'w1',
    title:
      'The Black Hawk War, or, How to Demolish an Entire Civilization and Still Feel Good About Yourself in the Morning, or, We Apologize for the Inconvenience but You’re Going to Have to Leave Now, or, “I Have Fought the Big Knives and Will Continue to Fight Them Until They Are Off Our Lands!”',
    artist: 'Sufjan Stevens',
    album: 'Illinois (Deluxe 10th Anniversary Edition)',
    duration: 134,
    artUrl: cover(40),
    reason: 'Because you gave 👍 to “Chicago” and 3 other songs on Sufjan Stevens radio, and it’s tagged “chamber pop”'
  },
  {
    // classical credits: a comma-joined artist list is how YouTube Music returns them
    id: 'w2',
    title: 'Symphony No. 9 in D Minor, Op. 125 “Choral”: IV. Presto – Allegro assai – Andante maestoso',
    artist: 'Berliner Philharmoniker, Herbert von Karajan, Gundula Janowitz, Hilde Rössel-Majdan, Waldemar Kmentt, Walter Berry, Wiener Singverein',
    album: 'Beethoven: The 9 Symphonies (Remastered 2014)',
    duration: 1458,
    artUrl: cover(210)
  },
  // one letter title, one letter artist
  { id: 'w3', title: 'i', artist: 'M', album: '7', duration: 7, artUrl: cover(330) },
  {
    // local file with no tags: title falls back to the file name, which has no spaces
    id: 'local:w4',
    title: 'VID_20240512_221530_live_at_the_fillmore_soundboard_remaster_FINAL_v3',
    artist: 'Unknown artist',
    duration: 0
  },
  {
    // stacked Vietnamese diacritics
    id: 'w5',
    title: 'Đừng Làm Trái Tim Anh Đau',
    artist: 'Sơn Tùng M-TP',
    album: 'Đừng Làm Trái Tim Anh Đau (Single)',
    duration: 326,
    artUrl: 'https://example.com/covers/this-image-404s.jpg'
  },
  // CJK, no spaces
  { id: 'w6', title: '夜に駆ける', artist: 'YOASOBI', album: 'THE BOOK', duration: 261, artUrl: cover(280, 1280, 720) },
  // RTL
  { id: 'w7', title: 'تملي معاك', artist: 'عمرو دياب', album: 'تملي معاك', duration: 287, artUrl: cover(60) },
  {
    // 3h 42m DJ set uploaded to YouTube; title is the full upload title
    id: 'w8',
    title: 'Fred again.. | Boiler Room: London (Full Set) [4K] 🔥🔥🔥',
    artist: 'Boiler Room',
    duration: 13338,
    artUrl: cover(0, 1600, 120)
  },
  // metadata-only Deezer chart row: no videoId yet, no art, no album
  { id: '', title: 'Tití Me Preguntó', artist: 'Bad Bunny', duration: 0 },
  {
    id: 'w10',
    title: 'Never Gonna Give You Up (Official Music Video) [4K Remaster] (Lyrics) (Sped Up + Reverb)',
    artist: 'Rick Astley',
    album: 'Whenever You Need Somebody',
    duration: 213,
    artUrl: cover(350)
  }
]

const worst: Dataset = {
  tracks: worstTracks,
  history: [
    { track: worstTracks[0], playedAt: now - 5_000 },
    { track: worstTracks[1], playedAt: now - 59 * MIN },
    { track: worstTracks[2], playedAt: now - 1 * DAY },
    { track: worstTracks[3], playedAt: now - 412 * DAY },
    { track: worstTracks[4], playedAt: now - 3 * DAY },
    { track: worstTracks[5], playedAt: now - 9 * DAY },
    { track: worstTracks[6], playedAt: now - 30 * DAY },
    { track: worstTracks[7], playedAt: now - 2 * MIN }
  ],
  stations: [
    {
      id: 11,
      seedType: 'artist',
      seedRef: 'Berliner Philharmoniker, Herbert von Karajan',
      name: 'Berliner Philharmoniker, Herbert von Karajan, Gundula Janowitz radio',
      artUrl: cover(210),
      createdAt: now,
      artists: []
    },
    { id: 12, seedType: 'tag', seedRef: 'liquid drum and bass', name: 'liquid drum and bass radio', createdAt: now, artists: [] },
    { id: 13, seedType: 'track', seedRef: 'w3', name: 'i radio', artUrl: cover(330), createdAt: now, artists: [] },
    { id: 14, seedType: 'playlist', seedRef: '9', name: '夜に駆ける radio', artUrl: 'https://example.com/404.jpg', createdAt: now, artists: [] }
  ],
  playlists: [
    // playlist names are unbounded (TEXT column, no maxLength on the input)
    { id: 21, name: '🔥 Songs for driving to Grandma’s house in the Upper Peninsula (summer 2024, DO NOT DELETE)', trackCount: 12847, createdAt: now },
    { id: 22, name: 'a', trackCount: 1, artUrl: cover(100), createdAt: now },
    { id: 23, name: 'Benachrichtigungstöne', trackCount: 0, createdAt: now },
    { id: 24, name: 'شغل', trackCount: 38, artUrl: cover(60), createdAt: now },
    { id: 25, name: 'Đi làm về', trackCount: 2, artUrl: 'https://example.com/404.jpg', createdAt: now },
    { id: 26, name: 'Workout', trackCount: 64, artUrl: cover(5), createdAt: now }
  ],
  albums: [
    { id: 'wa1', title: 'Beethoven: The 9 Symphonies (Remastered 2014) [Deluxe Edition with Bonus Rehearsal Recordings]', artist: 'Berliner Philharmoniker, Herbert von Karajan', year: '2014', artUrl: cover(210) },
    { id: 'wa2', title: '7', artist: 'M', artUrl: cover(330) },
    { id: 'wa3', title: 'THE BOOK', artist: 'YOASOBI', year: '2021', artUrl: cover(280, 1280, 720) },
    { id: 'wa4', title: 'Tití Me Preguntó', artist: 'Bad Bunny' }
  ],
  artists: [
    { id: 'wr1', name: 'Godspeed You! Black Emperor', subtitle: '1,284,512 monthly audience · Post-rock · Montréal', artUrl: cover(0, 160, 900) },
    { id: 'wr2', name: 'M' },
    { id: 'wr3', name: 'عمرو دياب', subtitle: 'Artist', artUrl: 'https://example.com/404.jpg' }
  ],
  mix: worstTracks.slice(0, 7),
  playing: 0,
  station: { id: 11, name: 'Berliner Philharmoniker, Herbert von Karajan, Gundula Janowitz radio' },
  position: 121,
  likedIds: ['w1', 'w5']
}

/* ---------- edge counts ---------- */

const empty: Dataset = {
  tracks: [],
  history: [],
  stations: [],
  playlists: [],
  albums: [],
  artists: [],
  mix: [],
  playing: -1,
  station: null,
  position: 0,
  likedIds: []
}

const one: Dataset = {
  ...empty,
  tracks: [demoTracks[0]],
  history: [{ track: demoTracks[0], playedAt: now }],
  stations: [demo.stations[0]],
  playlists: [{ id: 31, name: 'Road trip', trackCount: 1, artUrl: cover(30), createdAt: now }],
  albums: [demo.albums[0]],
  artists: [demo.artists[0]],
  mix: [{ ...demoTracks[1], reason: 'Because you liked M83' }],
  playing: 0,
  position: 1
}

const hugeTracks: RadioTrack[] = Array.from({ length: 1284 }, (_, i) => ({
  ...demoTracks[i % demoTracks.length],
  id: `huge${i}`
}))

const huge: Dataset = {
  ...demo,
  tracks: hugeTracks,
  history: hugeTracks.slice(0, 25).map((track, i) => ({ track, playedAt: now - i * 9 * MIN })),
  playlists: Array.from({ length: 140 }, (_, i) => ({ id: 100 + i, name: `Mix ${i + 1}`, trackCount: 1000 + i, artUrl: cover(i * 7), createdAt: now })),
  mix: hugeTracks.slice(0, 25),
  playing: 640
}

export const DATASETS: Record<DatasetName, Dataset> = { demo, worst, empty, one, huge }

export function discoverFeed(d: Dataset): DiscoverFeed {
  return {
    builtAt: now,
    mix: d.mix,
    shelves: [],
    artists: d.artists,
    tags: [],
    signals: { likes: d.likedIds.length, playlistTracks: 0, searches: 0, plays: d.history.length }
  }
}
