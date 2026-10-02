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

export interface Settings {
  lastfmApiKey: string
  audioQuality: AudioQuality
  theme: ThemeSetting
  closeToTray: boolean
  globalMediaKeys: boolean
  volume: number
}

export interface ResolverHealth {
  checkedAt: number
  youtubei: boolean
  ytdlp: boolean
  ytdlpVersion?: string
  error?: string
}

export interface ImportProgress {
  title?: string
  fetched: number
  done: boolean
}

export interface ImportResult {
  playlistId: number
  name: string
  count: number
}

export type OsCommand = 'playPause' | 'next' | 'prev' | 'thumbUp' | 'thumbDown' | 'show'

export interface NowPlaying {
  title?: string
  artist?: string
  playing: boolean
  inStation: boolean
}
