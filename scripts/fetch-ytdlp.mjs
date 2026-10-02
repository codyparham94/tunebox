// Downloads the latest yt-dlp.exe into resources/bin (gitignored) for packaging.
// The app copies it into userData on first run and self-updates it from there.
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const dir = new globalThis.URL('../resources/bin/', import.meta.url)
const dest = new globalThis.URL('yt-dlp.exe', dir)

if (existsSync(dest) && !process.argv.includes('--force')) {
  console.log(`yt-dlp.exe already present (${(statSync(dest).size / 1e6).toFixed(1)} MB). Use --force to re-download.`)
  process.exit(0)
}
mkdirSync(dir, { recursive: true })
console.log(`Downloading ${URL} …`)
const res = await fetch(URL)
if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
console.log(`Saved resources/bin/yt-dlp.exe (${(statSync(dest).size / 1e6).toFixed(1)} MB)`)
