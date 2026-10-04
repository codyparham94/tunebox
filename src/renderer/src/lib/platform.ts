/** The renderer is sandboxed, so it reads the platform from the user agent. */
export const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent)

/** "Windows" or "macOS", for copy that names the system. */
export const osName = isMac ? 'macOS' : 'Windows'

/** The track-skip shortcut's modifier: ⌘ on macOS, Ctrl on Windows. */
export const modKey = isMac ? '⌘' : 'Ctrl'
export const altKey = isMac ? '⌥' : 'Alt'

/** True when the platform's shortcut modifier (⌘ / Ctrl) is held. */
export const hasMod = (e: KeyboardEvent): boolean => (isMac ? e.metaKey : e.ctrlKey)
