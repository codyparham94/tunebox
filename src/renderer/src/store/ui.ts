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
  // open at launch (it's where a station shows what's coming), unless it would cover a small window
  queueOpen: window.innerWidth >= 900,
  addTarget: null,
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  openAddToPlaylist: (tracks) => set({ addTarget: tracks }),
  closeAddToPlaylist: () => set({ addTarget: null })
}))
