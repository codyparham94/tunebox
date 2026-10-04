// Downloads the latest yt-dlp into resources/bin (gitignored) for packaging.
// The app copies it into userData on first run and self-updates it from there.
// Windows gets yt-dlp.exe; macOS gets the universal yt-dlp_macos build, saved as `yt-dlp`.
// Defaults to the current platform; pass --mac or --win to fetch for another one.
import { chmodSync, createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const mac = process.argv.includes('--mac') || (process.platform === 'darwin' && !process.argv.includes('--win'))
const asset = mac ? 'yt-dlp_macos' : 'yt-dlp.exe'
const name = mac ? 'yt-dlp' : 'yt-dlp.exe'

const URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`
const dir = new globalThis.URL('../resources/bin/', import.meta.url)
const dest = new globalThis.URL(name, dir)

if (existsSync(dest) && !process.argv.includes('--force')) {
  console.log(`${name} already present (${(statSync(dest).size / 1e6).toFixed(1)} MB). Use --force to re-download.`)
  process.exit(0)
}
mkdirSync(dir, { recursive: true })
console.log(`Downloading ${URL} …`)
const res = await fetch(URL)
if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
if (mac) chmodSync(dest, 0o755)
console.log(`Saved resources/bin/${name} (${(statSync(dest).size / 1e6).toFixed(1)} MB)`)
