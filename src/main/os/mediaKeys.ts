import { globalShortcut } from 'electron'
import type { OsCommand } from '@shared/types'

const KEYS: [string, OsCommand][] = [
  ['MediaPlayPause', 'playPause'],
  ['MediaNextTrack', 'next'],
  ['MediaPreviousTrack', 'prev']
]

/**
 * Fallback only. Normally the renderer's `navigator.mediaSession` feeds Windows SMTC,
 * which already handles hardware media keys. Registering these globally takes the
 * keys away from other apps, so it's off by default (Settings → Global media keys).
 */
export function setGlobalMediaKeys(enabled: boolean, send: (cmd: OsCommand) => void): void {
  for (const [accel] of KEYS) if (globalShortcut.isRegistered(accel)) globalShortcut.unregister(accel)
  if (!enabled) return
  for (const [accel, cmd] of KEYS) {
    if (!globalShortcut.register(accel, () => send(cmd))) console.warn(`[mediaKeys] could not register ${accel}`)
  }
}
