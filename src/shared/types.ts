/** A playable track. `id` is a YouTube videoId; it is empty for metadata-only
 *  tracks (e.g. Deezer charts) until the matcher resolves one. */
export interface Track {
  id: string
  title: string
  artist: string
  artistId?: string
  album?: string
  albumId?: string
  /** seconds */
  duration: number
  artUrl?: string
}

export interface RadioTrack extends Track {
  reason?: string
}

export interface ArtistSummary {
  id: string
  name: string
  artUrl?: string
  subtitle?: string
}

export interface AlbumSummary {
  id: string
  title: string
  artist: string
  year?: string
  artUrl?: string
}

export interface RemotePlaylistSummary {
  id: string
  title: string
  author?: string
  artUrl?: string
}

export interface SearchResults {
  songs: Track[]
  artists: ArtistSummary[]
  albums: AlbumSummary[]
  playlists: RemotePlaylistSummary[]
}

export type SearchKind = keyof SearchResults

export interface ArtistPage {
  id: string
  name: string
  description?: string
  artUrl?: string
  topSongs: Track[]
  albums: AlbumSummary[]
  singles: AlbumSummary[]
  related: ArtistSummary[]
}

export interface Collection {
  id: string
  title: string
  subtitle?: string
  artist?: string
  artistId?: string
  artUrl?: string
  tracks: Track[]
}

export interface Genre {
  id: number
  name: string
  artUrl?: string
}

export interface LocalPlaylist {
  id: number
  name: string
  trackCount: number
  artUrl?: string
  createdAt: number
}

export interface LocalPlaylistDetail extends LocalPlaylist {
  tracks: Track[]
}

export interface SearchEntry {
  query: string
  /** artist of the top song result */
  topArtist?: string
  topTrack?: Track
  at: number
}

/** A row of recommendations built around one thing the user liked, searched or saved. */
export interface DiscoverShelf {
  id: string
  title: string
  subtitle?: string
  seed?: Track
  tracks: RadioTrack[]
}

export interface DiscoverSignals {
  likes: number
  playlistTracks: number
  searches: number
  plays: number
}

export interface DiscoverFeed {
  builtAt: number
  /** the best picks across every signal, each with a reason */
  mix: RadioTrack[]
  shelves: DiscoverShelf[]
  /** artists the user hasn't played yet; subtitle says why */
  artists: ArtistSummary[]
  /** genres/moods the user leans towards (needs Last.fm tags) */
  tags: string[]
  signals: DiscoverSignals
}

export interface HistoryEntry {
  track: Track
  playedAt: number
}

export type SeedType = 'track' | 'artist' | 'playlist' | 'tag'

export interface StationSeed {
  type: SeedType
  /** track: videoId, artist: artist name, playlist: local playlist id, tag: tag name */
  ref: string
  name: string
  artUrl?: string
  /** For track seeds: the track's metadata, so Last.fm lookups work. */
  track?: Track
}

export interface Station {
  id: number
  seedType: SeedType
  seedRef: string
  name: string
  artUrl?: string
  createdAt: number
  lastPlayedAt?: number
  /** artists the user added on top of the seed */
  artists: string[]
}

export interface PlayEvent {
  track: Track
  listenedMs: number
  completed: boolean
  skipped: boolean
  stationId: number | null
}

export type AudioQuality = 'high' | 'low'
/** 'system', or a theme id from renderer/src/lib/themes.ts */
export type ThemeSetting = string

/** 'system' follows Windows' “Animation effects” switch. */
export type MotionSetting = 'system' | 'full' | 'reduced'

export interface Settings {
  lastfmApiKey: string
  audioQuality: AudioQuality
  theme: ThemeSetting
  motion: MotionSetting
  closeToTray: boolean
  globalMediaKeys: boolean
  /** when the queue ends, keep playing with Discover picks */
  autoplay: boolean
  volume: number
  /** local music folder; empty until the user picks one */
  musicFolder: string
}

export interface ResolverHealth {
  checkedAt: number
  youtubei: boolean
  ytdlp: boolean
  ytdlpVersion?: string
  error?: string
}

export type PlaylistSource = 'youtube' | 'spotify' | 'apple' | 'deezer'

export interface ImportProgress {
  title?: string
  /** songs read so far (YouTube), or matched so far (other services) */
  fetched: number
  /** other services: how many songs are being matched to YouTube */
  total?: number
  done: boolean
}

export interface ImportResult {
  playlistId: number
  name: string
  count: number
  source: PlaylistSource
  /** songs that couldn't be found on YouTube and were left out */
  skipped: number
  /** Spotify only shares the first 100 songs of a playlist without signing in */
  truncated?: boolean
}

export type OsCommand = 'playPause' | 'next' | 'prev' | 'thumbUp' | 'thumbDown' | 'show'

export interface NowPlaying {
  title?: string
  artist?: string
  playing: boolean
  inStation: boolean
}

export interface ChartAlbum {
  title: string
  artist: string
  artUrl?: string
}

export interface ChartArtist {
  name: string
  artUrl?: string
}

export interface PlayCount {
  track: Track
  plays: number
}

export interface LocalScanResult {
  folder: string
  total: number
  added: number
  updated: number
  removed: number
}

export interface LocalScanProgress {
  scanned: number
  total: number
  done: boolean
}

/** Auto-update progress, pushed from main. 'unsupported' = dev build (no release feed). */
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'unsupported'
  version?: string
  /** release notes as plain text */
  notes?: string
  percent?: number
  error?: string
  /** unsigned macOS builds can't install themselves: "install" opens the download page instead */
  manual?: boolean
}
