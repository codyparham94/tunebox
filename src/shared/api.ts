import type {
  ArtistPage,
  ChartAlbum,
  ChartArtist,
  Collection,
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
  SearchResults,
  Settings,
  Station,
  StationSeed,
  Track
} from './types'

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
  }
  radio: {
    stations(): Promise<Station[]>
    create(seed: StationSeed): Promise<Station>
    remove(id: number): Promise<void>
    next(stationId: number, count: number): Promise<RadioTrack[]>
    feedback(stationId: number | null, track: Track, value: 1 | -1): Promise<void>
  }
  importer: {
    playlist(url: string): Promise<ImportResult>
  }
  local: {
    /** Opens a folder picker; saves and scans the choice. null if cancelled. */
    chooseFolder(): Promise<LocalScanResult | null>
    scan(): Promise<LocalScanResult>
    tracks(): Promise<Track[]>
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
  }
}

/** Main → renderer events. */
export interface TuneboxEvents {
  onCommand(cb: (cmd: OsCommand) => void): () => void
  onImportProgress(cb: (p: ImportProgress) => void): () => void
  onHealth(cb: (h: ResolverHealth) => void): () => void
  onLocalScan(cb: (p: LocalScanProgress) => void): () => void
}

export type WindowApi = TuneboxApi & TuneboxEvents

export const EVENT = {
  command: 'event:command',
  importProgress: 'event:importProgress',
  health: 'event:health',
  localScan: 'event:localScan'
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
    'topPlayed'
  ],
  radio: ['stations', 'create', 'remove', 'next', 'feedback'],
  importer: ['playlist'],
  local: ['chooseFolder', 'scan', 'tracks'],
  settings: ['get', 'set'],
  system: ['prefetch', 'health', 'updateYtdlp', 'nowPlaying']
} as const satisfies { [G in keyof TuneboxApi]: readonly (keyof TuneboxApi[G])[] }

export const AUDIO_SCHEME = 'tunebox-audio'
/** Local-file tracks use ids like `local:42`; everything else is a YouTube videoId. */
export const LOCAL_PREFIX = 'local:'
export const isLocalId = (id: string): boolean => id.startsWith(LOCAL_PREFIX)

export const audioUrl = (id: string): string =>
  isLocalId(id) ? `${AUDIO_SCHEME}://local/${id.slice(LOCAL_PREFIX.length)}` : `${AUDIO_SCHEME}://track/${id}`
