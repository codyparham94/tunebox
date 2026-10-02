import { create } from 'zustand'
import type { Track } from '@shared/types'

interface UiState {
  queueOpen: boolean
  /** Tracks waiting for the "Add to playlist" dialog. */
  addTarget: Track[] | null
  toggleQueue(): void
  openAddToPlaylist(tracks: Track[]): void
  closeAddToPlaylist(): void
}

export const useUi = create<UiState>((set) => ({
  queueOpen: false,
  addTarget: null,
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  openAddToPlaylist: (tracks) => set({ addTarget: tracks }),
  closeAddToPlaylist: () => set({ addTarget: null })
}))
