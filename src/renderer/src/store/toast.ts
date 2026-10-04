import { create } from 'zustand'

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  message: string
  /** sticky toasts stay until updated or dismissed */
  sticky?: boolean
  /** playing its exit; removed once that finishes */
  leaving?: boolean
}

interface ToastState {
  toasts: Toast[]
  show(t: Omit<Toast, 'id'> & { id?: number }): number
  dismiss(id: number): void
}

let nextId = 1
/** matches .toast[data-leaving] in app.css */
const EXIT_MS = 200

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  show(t) {
    const id = t.id ?? nextId++
    const toast = { ...t, id }
    set({ toasts: [...get().toasts.filter((x) => x.id !== id), toast].slice(-4) })
    if (!t.sticky) setTimeout(() => get().dismiss(id), t.kind === 'error' ? 7000 : 4000)
    return id
  },
  dismiss(id) {
    if (!get().toasts.some((x) => x.id === id && !x.leaving)) return
    set({ toasts: get().toasts.map((x) => (x.id === id ? { ...x, leaving: true } : x)) })
    setTimeout(() => set({ toasts: get().toasts.filter((x) => !(x.id === id && x.leaving)) }), EXIT_MS)
  }
}))

export const toast = {
  info: (message: string) => useToasts.getState().show({ kind: 'info', message }),
  success: (message: string) => useToasts.getState().show({ kind: 'success', message }),
  error: (message: string) => useToasts.getState().show({ kind: 'error', message })
}
