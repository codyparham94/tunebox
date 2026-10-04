import { execFile } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { appPaths } from '../context'

/** yt-dlp.exe on Windows; the universal yt-dlp_macos build, saved as plain `yt-dlp`, on macOS. */
export const YTDLP_BIN = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'

/**
 * The installer ships yt-dlp read-only under resources/bin. We copy it into
 * userData on first use so `yt-dlp -U` can update it in place.
 */
export function ytdlpPath(): string | null {
  const { userData, ytdlpBundled } = appPaths()
  const local = join(userData, 'bin', YTDLP_BIN)
  if (existsSync(local)) return local
  if (ytdlpBundled && existsSync(ytdlpBundled)) {
    mkdirSync(join(userData, 'bin'), { recursive: true })
    copyFileSync(ytdlpBundled, local)
    if (process.platform !== 'win32') {
      chmodSync(local, 0o755)
      // A copy out of a downloaded (quarantined) app is quarantined too, and macOS refuses to run it.
      if (process.platform === 'darwin') execFile('xattr', ['-d', 'com.apple.quarantine', local], () => undefined)
    }
    return local
  }
  return null
}

function run(args: string[], timeoutMs = 30_000): Promise<string> {
  const bin = ytdlpPath()
  if (!bin) return Promise.reject(new Error('yt-dlp is not installed. Run `npm run fetch:ytdlp`.'))
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim().split('\n').pop() || err.message))
      else resolve(stdout)
    })
  })
}

export async function ytdlpVersion(): Promise<string> {
  return (await run(['--version'])).trim()
}

export async function ytdlpUpdate(): Promise<string> {
  const out = await run(['-U'], 120_000)
  return out.trim().split('\n').pop() ?? 'Updated'
}

export interface YtdlpStream {
  url: string
  mime: string
  headers: Record<string, string>
}

export async function ytdlpResolve(videoId: string, quality: 'high' | 'low'): Promise<YtdlpStream> {
  const format = quality === 'low' ? 'worstaudio[ext=m4a]/worstaudio' : 'bestaudio[ext=m4a]/bestaudio'
  const out = await run([
    '-j',
    '--no-warnings',
    '--no-playlist',
    '-f',
    format,
    `https://www.youtube.com/watch?v=${videoId}`
  ])
  const info = JSON.parse(out) as { url: string; ext: string; acodec?: string; http_headers?: Record<string, string> }
  if (!info.url) throw new Error('yt-dlp returned no URL')
  return {
    url: info.url,
    mime: info.ext === 'webm' ? 'audio/webm' : 'audio/mp4',
    headers: info.http_headers ?? {}
  }
}
