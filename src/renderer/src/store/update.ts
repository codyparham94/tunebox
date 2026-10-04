import { create } from 'zustand'
import type { UpdateStatus } from '@shared/types'
import { api, errorMessage } from '../lib/queries'
import { toast } from './toast'

interface UpdateState {
  status: UpdateStatus
  /** version the user said "Not now" to; not offered again this session unless they check by hand */
  dismissed: string | null
  open: boolean
}

export const useUpdate = create<UpdateState>(() => ({ status: { state: 'idle' }, dismissed: null, open: false }))
const set = useUpdate.setState
const get = useUpdate.getState

function receive(status: UpdateStatus): void {
  const { dismissed, open } = get()
  const offer = status.state === 'available' && status.version !== dismissed
  // Keep the prompt open while it downloads and installs, so the user sees progress.
  set({ status, open: open || offer })
}

/** Subscribe once, from the main window. */
export function initUpdates(): () => void {
  void api.system.updateStatus().then(receive).catch(() => undefined)
  return window.api.onUpdate(receive)
}

export const updates = {
  install: async (): Promise<void> => {
    try {
      await api.system.installUpdate()
      // macOS: the download page is open in the browser; nothing else happens in here
      if (get().status.manual) set({ open: false })
    } catch (err) {
      set({ status: { ...get().status, state: 'error', error: errorMessage(err) } })
    }
  },
  later: (): void => set({ open: false, dismissed: get().status.version ?? null }),
  /** "Check for updates" in Settings: always reports back, even for a version dismissed earlier. */
  check: async (): Promise<void> => {
    try {
      const status = await api.system.checkUpdate()
      if (status.state === 'unsupported') toast.info('Updates work in the installed app, not in a dev build.')
      else if (status.state === 'available') set({ status, dismissed: null, open: true })
      else if (status.state === 'idle') toast.success('You’re on the latest version.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }
}
