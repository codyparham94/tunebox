import { deflateSync } from 'node:zlib'
import { nativeImage, nativeTheme, type BrowserWindow } from 'electron'
import type { NowPlaying, OsCommand } from '@shared/types'

/**
 * Previous / play-pause / next buttons under the taskbar thumbnail (Windows only).
 * The glyphs are drawn here rather than shipped as files so they can follow the
 * taskbar's light or dark mode.
 */

type Point = [number, number]
/** Convex polygons on a 16-unit grid. */
const GLYPHS: Record<'prev' | 'play' | 'pause' | 'next', Point[][]> = {
  prev: [rect(3, 3, 5, 13), [[13, 3], [13, 13], [6, 8]]],
  play: [[[5, 2.5], [13.5, 8], [5, 13.5]]],
  pause: [rect(4, 3, 7, 13), rect(9, 3, 12, 13)],
  next: [[[3, 3], [10, 8], [3, 13]], rect(11, 3, 13, 13)]
}

function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

let win: BrowserWindow | null = null
let send: (cmd: OsCommand) => void = () => {}
let state: NowPlaying = { playing: false, inStation: false }
let shown = ''

export function createThumbar(w: BrowserWindow, sendCommand: (cmd: OsCommand) => void): void {
  if (process.platform !== 'win32') return
  win = w
  send = sendCommand
  // Windows drops the buttons when the window is hidden (close to tray), so put them back.
  w.on('show', () => render(true))
  nativeTheme.on('updated', () => render())
  w.on('closed', () => {
    win = null
  })
}

export function updateThumbar(next: NowPlaying): void {
  state = next
  render()
}

function render(force = false): void {
  if (!win || win.isDestroyed() || !win.isVisible()) return
  const dark = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
  const hasTrack = !!state.title
  const key = `${dark}|${state.playing}|${hasTrack}`
  if (key === shown && !force) return
  const color: [number, number, number] = dark ? [255, 255, 255] : [32, 32, 32]
  const ok = win.setThumbarButtons([
    { tooltip: 'Previous', icon: glyph('prev', color), flags: hasTrack ? [] : ['disabled'], click: () => send('prev') },
    {
      tooltip: state.playing ? 'Pause' : 'Play',
      icon: glyph(state.playing ? 'pause' : 'play', color),
      click: () => send('playPause')
    },
    { tooltip: 'Next', icon: glyph('next', color), flags: hasTrack ? [] : ['disabled'], click: () => send('next') }
  ])
  shown = ok ? key : ''
}

const cache = new Map<string, Electron.NativeImage>()

/** The glyph at every size Windows may ask for (100–200% scaling). */
function glyph(name: keyof typeof GLYPHS, color: [number, number, number]): Electron.NativeImage {
  const id = `${name}|${color.join(',')}`
  let img = cache.get(id)
  if (!img) {
    img = nativeImage.createEmpty()
    for (const [scaleFactor, size] of [[1, 16], [1.25, 20], [1.5, 24], [2, 32]] as const) {
      img.addRepresentation({ scaleFactor, buffer: rasterize(GLYPHS[name], size, color) })
    }
    cache.set(id, img)
  }
  return img
}

/** Renders polygons to an antialiased PNG (4×4 supersampling). */
function rasterize(polys: Point[][], size: number, [r, g, b]: [number, number, number]): Buffer {
  const SS = 4
  const scale = size / 16
  const inside = (x: number, y: number) =>
    polys.some((poly) => {
      let sign = 0
      for (let i = 0; i < poly.length; i++) {
        const [x0, y0] = poly[i]
        const [x1, y1] = poly[(i + 1) % poly.length]
        const cross = (x1 - x0) * scale * (y - y0 * scale) - (y1 - y0) * scale * (x - x0 * scale)
        if (cross === 0) continue
        if (sign === 0) sign = Math.sign(cross)
        else if (Math.sign(cross) !== sign) return false
      }
      return true
    })
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) if (inside(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++
      }
      const o = y * stride + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = Math.round((hits / (SS * SS)) * 255)
    }
  }
  return png(size, raw)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc(buf: Buffer): number {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}

/** `raw` is filtered RGBA scanlines (a 0 filter byte before each row). */
function png(size: number, raw: Buffer): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}
