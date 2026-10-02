// Renders the app icon (resources/icon.png, 256×256): a peach rounded tile with dark equalizer bars.
// Also renders the tray icon at each size Windows uses (100%–200% scaling). At 16 px the app icon's thin
// bars blur into the tile, so the tray version has three bolder bars on the same tile.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const SS = 4 // supersampling
const peach = [0xfa, 0xd4, 0xc0], ink = [0x11, 0x18, 0x27]

/** Bars are [x, top, bottom]; every measurement is a fraction of the icon size. */
function render(S, { radius, barWidth, bars }) {
  const r = radius * S
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, r), S - r), cy = Math.min(Math.max(y, r), S - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  }
  const br = (barWidth * S) / 2
  const inBar = (x, y) => bars.some(([fx, ft, fb]) => {
    const bx = fx * S, t = ft * S, b = fb * S
    if (x < bx - br || x > bx + br) return false
    if (y >= t + br && y <= b - br) return true
    const cy = y < t + br ? t + br : b - br
    return (x - bx) ** 2 + (y - cy) ** 2 <= br * br
  })
  const raw = Buffer.alloc((S * 4 + 1) * S)
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0
    for (let x = 0; x < S; x++) {
      let a = 0, rr = 0, gg = 0, bb = 0
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS
        if (!inRounded(px, py)) continue
        const c = inBar(px, py) ? ink : peach
        a++; rr += c[0]; gg += c[1]; bb += c[2]
      }
      const o = y * (S * 4 + 1) + 1 + x * 4
      if (a) { raw[o] = rr / a; raw[o + 1] = gg / a; raw[o + 2] = bb / a }
      raw[o + 3] = Math.round((a / (SS * SS)) * 255)
    }
  }
  return png(S, raw)
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
function png(S, raw) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ])
}

const out = (name, data) => {
  writeFileSync(new URL(`../resources/${name}`, import.meta.url), data)
  console.log(`wrote resources/${name}`)
}

out('icon.png', render(256, {
  radius: 56 / 256,
  barWidth: 22 / 256,
  bars: [[64, 112, 160], [104, 72, 184], [144, 96, 176], [184, 128, 152]].map((b) => b.map((v) => v / 256))
}))

const TRAY = { radius: 0.22, barWidth: 0.17, bars: [[0.28, 0.36, 0.68], [0.5, 0.22, 0.78], [0.72, 0.42, 0.62]] }
for (const size of [16, 20, 24, 32]) out(`tray-${size}.png`, render(size, TRAY))
