import type {
  ArtistPage,
  Collection,
  Genre,
  HistoryEntry,
  ImportProgress,
  ImportResult,
  LocalPlaylist,
  LocalPlaylistDetail,
  NowPlaying,
  OsCommand,
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
    charts(genreId?: number): Promise<Track[]>
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
}

export type WindowApi = TuneboxApi & TuneboxEvents

export const EVENT = {
  command: 'event:command',
  importProgress: 'event:importProgress',
  health: 'event:health'
} as const

/** Every invokable method, grouped. The preload builds the bridge from this list. */
export const API_METHODS = {
  catalog: ['search', 'artist', 'album', 'remotePlaylist', 'match', 'locate', 'charts', 'genres', 'tags'],
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
    'history'
  ],
  radio: ['stations', 'create', 'remove', 'next', 'feedback'],
  importer: ['playlist'],
  settings: ['get', 'set'],
  system: ['prefetch', 'health', 'updateYtdlp', 'nowPlaying']
} as const satisfies { [G in keyof TuneboxApi]: readonly (keyof TuneboxApi[G])[] }

export const AUDIO_SCHEME = 'tunebox-audio'
export const audioUrl = (videoId: string): string => `${AUDIO_SCHEME}://track/${videoId}`
