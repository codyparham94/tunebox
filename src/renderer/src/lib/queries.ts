import { QueryClient, useQuery } from '@tanstack/react-query'

export const api = window.api

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1, refetchOnWindowFocus: false }
  }
})

/** Strip Electron's "Error invoking remote method 'x': Error:" prefix. */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export const keys = {
  playlists: ['playlists'] as const,
  playlist: (id: number) => ['playlist', id] as const,
  liked: ['liked'] as const,
  likedIds: ['likedIds'] as const,
  history: ['history'] as const,
  stations: ['stations'] as const,
  settings: ['settings'] as const,
  health: ['health'] as const
}

/** Local data: always fresh. */
const local = { staleTime: 0 }

export const useSearch = (q: string) =>
  useQuery({ queryKey: ['search', q], queryFn: () => api.catalog.search(q), enabled: q.trim().length > 0 })
export const useArtist = (id: string) => useQuery({ queryKey: ['artist', id], queryFn: () => api.catalog.artist(id) })
export const useAlbum = (id: string) => useQuery({ queryKey: ['album', id], queryFn: () => api.catalog.album(id) })
export const useRemotePlaylist = (id: string) =>
  useQuery({ queryKey: ['remotePlaylist', id], queryFn: () => api.catalog.remotePlaylist(id) })
export const useCharts = (genreId = 0) =>
  useQuery({ queryKey: ['charts', genreId], queryFn: () => api.catalog.charts(genreId), staleTime: 30 * 60 * 1000 })
export const useGenres = () =>
  useQuery({ queryKey: ['genres'], queryFn: () => api.catalog.genres(), staleTime: Infinity })
export const useTags = () => useQuery({ queryKey: ['tags'], queryFn: () => api.catalog.tags(), staleTime: Infinity })

export const usePlaylists = () => useQuery({ queryKey: keys.playlists, queryFn: () => api.library.playlists(), ...local })
export const usePlaylist = (id: number) =>
  useQuery({ queryKey: keys.playlist(id), queryFn: () => api.library.playlist(id), ...local })
export const useLiked = () => useQuery({ queryKey: keys.liked, queryFn: () => api.library.liked(), ...local })
export const useLikedIds = () =>
  useQuery({ queryKey: keys.likedIds, queryFn: async () => new Set(await api.library.likedIds()), ...local })
export const useHistory = (limit = 30) =>
  useQuery({ queryKey: [...keys.history, limit], queryFn: () => api.library.history(limit), ...local })
export const useStations = () => useQuery({ queryKey: keys.stations, queryFn: () => api.radio.stations(), ...local })
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api.settings.get(), ...local })
export const useHealth = () => useQuery({ queryKey: keys.health, queryFn: () => api.system.health(), ...local })

export function invalidateLikes(): void {
  void queryClient.invalidateQueries({ queryKey: keys.liked })
  void queryClient.invalidateQueries({ queryKey: keys.likedIds })
}

export function invalidatePlaylists(id?: number): void {
  void queryClient.invalidateQueries({ queryKey: keys.playlists })
  if (id !== undefined) void queryClient.invalidateQueries({ queryKey: keys.playlist(id) })
}
