import type {
  AlbumSummary,
  ArtistPage,
  ChartAlbum,
  ChartArtist,
  Collection,
  DiscoverFeed,
  Genre,
  HistoryEntry,
  ImportProgress,
  ImportResult,
  LocalPlaylist,
  LocalPlaylistDetail,
  LocalScanProgress,
  LocalScanResult,
  NowPlaying,
  OsCommand,
  PlayCount,
  PlayEvent,
  RadioTrack,
  ResolverHealth,
  SearchEntry,
  SearchResults,
  Settings,
  Station,
  StationSeed,
  Track,
  UpdateStatus
} from './types'
import type { EqState } from './eq'

/** Request/response IPC handlers. The channel name is `<group>:<method>`. */
export interface TuneboxApi {
  catalog: {
    search(query: string): Promise<SearchResults>
    artist(id: string): Promise<ArtistPage>
    album(id: string): Promise<Collection>
    remotePlaylist(id: string): Promise<Collection>
    match(track: Track): Promise<Track | null>
    /** artist/album ids for a track that lacks them */
    locate(track: Track): Promise<{ artistId?: string; albumId?: string }>
    charts(genreId?: number, limit?: number): Promise<Track[]>
    chartAlbums(genreId?: number): Promise<ChartAlbum[]>
    chartArtists(genreId?: number): Promise<ChartArtist[]>
    /** YT Music ids for chart entries (which come from Deezer) */
    findArtist(name: string): Promise<string | null>
    findAlbum(title: string, artist: string): Promise<string | null>
    genres(): Promise<Genre[]>
    tags(): Promise<string[]>
  }
  library: {
    playlists(): Promise<LocalPlaylist[]>
    playlist(id: number): Promise<LocalPlaylistDetail>
    createPlaylist(name: string, tracks?: Track[]): Promise<LocalPlaylist>
    renamePlaylist(id: number, name: string): Promise<void>
    deletePlaylist(id: number): Promise<void>
    addTracks(id: number, tracks: Track[]): Promise<void>
    removeTrack(id: number, position: number): Promise<void>
    moveTrack(id: number, from: number, to: number): Promise<void>
    liked(): Promise<Track[]>
    likedIds(): Promise<string[]>
    setLiked(track: Track, liked: boolean): Promise<void>
    recordPlay(event: PlayEvent): Promise<void>
    history(limit?: number): Promise<HistoryEntry[]>
    topPlayed(days: number, limit: number): Promise<PlayCount[]>
    /** Albums liked with ♥ on an album page, newest first. */
    likedAlbums(): Promise<AlbumSummary[]>
    setAlbumLiked(album: AlbumSummary, liked: boolean): Promise<void>
  }
  radio: {
    stations(): Promise<Station[]>
    create(seed: StationSeed): Promise<Station>
    remove(id: number): Promise<void>
    next(stationId: number, count: number): Promise<RadioTrack[]>
    feedback(stationId: number | null, track: Track, value: 1 | -1): Promise<void>
    /** Widen a station with another artist's songs and their similar artists. */
    addArtist(stationId: number, name: string): Promise<Station>
    removeArtist(stationId: number, name: string): Promise<Station>
  }
  importer: {
    /** YouTube, YouTube Music, Spotify, Apple Music or Deezer playlist link. */
    playlist(url: string): Promise<ImportResult>
  }
  discover: {
    /** Recommendations from likes, playlists, searches and plays. Cached; `refresh` rebuilds. */
    feed(refresh?: boolean): Promise<DiscoverFeed>
    searches(limit?: number): Promise<SearchEntry[]>
    clearSearches(): Promise<void>
  }
  local: {
    /** Opens a folder picker; saves and scans the choice. null if cancelled. */
    chooseFolder(): Promise<LocalScanResult | null>
    scan(): Promise<LocalScanResult>
    tracks(): Promise<Track[]>
  }
  eq: {
    get(): Promise<EqState>
    /** Saves and broadcasts to every window; `clientId` lets the sender ignore its own echo. */
    set(state: EqState, clientId: string): Promise<void>
    /** Opens (or focuses) the pop-out equalizer window. */
    popout(): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  system: {
    prefetch(videoId: string): Promise<void>
    health(): Promise<ResolverHealth | null>
    updateYtdlp(): Promise<string>
    nowPlaying(state: NowPlaying): Promise<void>
    appVersion(): Promise<string>
    /** Asks GitHub for a newer release. */
    checkUpdate(): Promise<UpdateStatus>
    updateStatus(): Promise<UpdateStatus>
    /** Downloads the update, installs it and restarts. Only after the user agrees. */
    installUpdate(): Promise<void>
  }
}

/** Main → renderer events. */
export interface TuneboxEvents {
  onCommand(cb: (cmd: OsCommand) => void): () => void
  onImportProgress(cb: (p: ImportProgress) => void): () => void
  onHealth(cb: (h: ResolverHealth) => void): () => void
  onLocalScan(cb: (p: LocalScanProgress) => void): () => void
  onEq(cb: (msg: { state: EqState; clientId: string }) => void): () => void
  onUpdate(cb: (status: UpdateStatus) => void): () => void
}

export type WindowApi = TuneboxApi & TuneboxEvents

export const EVENT = {
  command: 'event:command',
  importProgress: 'event:importProgress',
  health: 'event:health',
  localScan: 'event:localScan',
  eq: 'event:eq',
  update: 'event:update'
} as const

/** Every invokable method, grouped. The preload builds the bridge from this list. */
export const API_METHODS = {
  catalog: ['search', 'artist', 'album', 'remotePlaylist', 'match', 'locate', 'charts', 'chartAlbums', 'chartArtists', 'findArtist', 'findAlbum', 'genres', 'tags'],
  library: [
    'playlists',
    'playlist',
    'createPlaylist',
    'renamePlaylist',
    'deletePlaylist',
    'addTracks',
    'removeTrack',
    'moveTrack',
    'liked',
    'likedIds',
    'setLiked',
    'recordPlay',
    'history',
    'topPlayed',
    'likedAlbums',
    'setAlbumLiked'
  ],
  radio: ['stations', 'create', 'remove', 'next', 'feedback', 'addArtist', 'removeArtist'],
  importer: ['playlist'],
  discover: ['feed', 'searches', 'clearSearches'],
  local: ['chooseFolder', 'scan', 'tracks'],
  eq: ['get', 'set', 'popout'],
  settings: ['get', 'set'],
  system: ['prefetch', 'health', 'updateYtdlp', 'nowPlaying', 'appVersion', 'checkUpdate', 'updateStatus', 'installUpdate']
} as const satisfies { [G in keyof TuneboxApi]: readonly (keyof TuneboxApi[G])[] }

export const AUDIO_SCHEME = 'tunebox-audio'
/** Local-file tracks use ids like `local:42`; everything else is a YouTube videoId. */
export const LOCAL_PREFIX = 'local:'
export const isLocalId = (id: string): boolean => id.startsWith(LOCAL_PREFIX)

export const audioUrl = (id: string): string =>
  isLocalId(id) ? `${AUDIO_SCHEME}://local/${id.slice(LOCAL_PREFIX.length)}` : `${AUDIO_SCHEME}://track/${id}`
