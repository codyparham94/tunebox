import { app, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

const { autoUpdater } = electronUpdater

const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

let status: UpdateStatus = { state: 'idle' }
let emit: (s: UpdateStatus) => void = () => {}
let started = false

/**
 * macOS builds are unsigned, and macOS only lets signed apps replace themselves. There we check
 * GitHub's latest release directly and send the user to its download page.
 */
const MANUAL = process.platform === 'darwin'
const LATEST_API = 'https://api.github.com/repos/codyparham94/tunebox/releases/latest'
let downloadPage = 'https://github.com/codyparham94/tunebox/releases/latest'

function set(next: UpdateStatus): void {
  status = next
  emit(status)
}

/** Release notes arrive as HTML from GitHub; the prompt shows plain text. */
function plainNotes(notes: unknown): string | undefined {
  const text = Array.isArray(notes) ? notes.map((n) => n?.note ?? '').join('\n') : typeof notes === 'string' ? notes : ''
  const plain = text
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return plain || undefined
}

/** Release bodies are Markdown; the prompt shows plain text. */
function plainMarkdown(md: string | undefined): string | undefined {
  const text = (md ?? '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^- /gm, '• ')
    .trim()
  return text || undefined
}

/** True when dotted version `a` is newer than `b` (1.10.0 > 1.9.3). */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0
  }
  return false
}

async function checkManually(): Promise<void> {
  const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const rel = (await res.json()) as { tag_name: string; body?: string; html_url: string; assets: { name: string }[] }
  const version = rel.tag_name.replace(/^v/, '')
  // A release whose Mac build hasn't been attached yet isn't an update for this Mac.
  const forMac = rel.assets.some((a) => a.name.endsWith('.dmg'))
  downloadPage = rel.html_url
  if (forMac && isNewer(version, app.getVersion())) set({ state: 'available', version, notes: plainMarkdown(rel.body), manual: true })
  else set({ state: 'idle' })
}

/**
 * Checks GitHub Releases for a newer version. Nothing downloads until the user agrees;
 * then it downloads, installs over the current version and restarts.
 * Only runs in the installed app (a dev build has no release feed).
 */
export function startUpdater(onStatus: (s: UpdateStatus) => void): void {
  emit = onStatus
  if (!app.isPackaged || started) return
  started = true
  if (MANUAL) {
    setTimeout(() => void checkForUpdate().catch(() => undefined), FIRST_CHECK_MS)
    setInterval(() => void checkForUpdate().catch(() => undefined), CHECK_EVERY_MS)
    return
  }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null
  // For testing a build against a local copy of the release files instead of GitHub.
  const feed = process.env.TUNEBOX_UPDATE_FEED
  if (feed) autoUpdater.setFeedURL({ provider: 'generic', url: feed })

  autoUpdater.on('update-available', (info) =>
    set({ state: 'available', version: info.version, notes: plainNotes(info.releaseNotes) })
  )
  autoUpdater.on('update-not-available', () => {
    if (status.state === 'checking') set({ state: 'idle' })
  })
  autoUpdater.on('download-progress', (p) =>
    set({ state: 'downloading', version: status.version, percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'ready', version: info.version })
    // Silent install over the current version, then reopen Tunebox.
    if (process.env.TUNEBOX_UPDATE_DRYRUN) console.log(`[updater] dry run: would install ${info.version} now`)
    else setTimeout(() => autoUpdater.quitAndInstall(true, true), 1200)
  })
  autoUpdater.on('error', (err) => {
    console.warn('[updater]', err.message)
    // A failed background check is not worth interrupting anyone; a failed install is.
    if (status.state === 'downloading' || status.state === 'ready') set({ state: 'error', version: status.version, error: err.message })
    else if (status.state === 'checking') set({ state: 'idle' })
  })

  setTimeout(() => void checkForUpdate(), FIRST_CHECK_MS)
  setInterval(() => void checkForUpdate(), CHECK_EVERY_MS)
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) return { state: 'unsupported' }
  if (status.state === 'downloading' || status.state === 'ready') return status
  set({ state: 'checking' })
  try {
    if (MANUAL) await checkManually()
    else await autoUpdater.checkForUpdates()
  } catch (err) {
    set({ state: 'idle' })
    throw new Error(`Couldn’t check for updates: ${(err as Error).message}`)
  }
  return status
}

export async function installUpdate(): Promise<void> {
  if (status.state !== 'available' && status.state !== 'error') throw new Error('No update is ready to install.')
  if (MANUAL) {
    await shell.openExternal(downloadPage)
    return
  }
  set({ state: 'downloading', version: status.version, percent: 0 })
  await autoUpdater.downloadUpdate()
}

export const updateStatus = (): UpdateStatus => status
