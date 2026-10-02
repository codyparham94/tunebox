// Renders resources/icon.png (256×256): a peach rounded tile with dark equalizer bars.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const S = 256, SS = 4 // supersampling
const peach = [0xfa, 0xd4, 0xc0], ink = [0x11, 0x18, 0x27]
const bars = [[64, 112, 160], [104, 72, 184], [144, 96, 176], [184, 128, 152]] // x, top, bottom
const inRounded = (x, y, r = 56) => {
  const cx = Math.min(Math.max(x, r), S - r), cy = Math.min(Math.max(y, r), S - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
const inBar = (x, y) => bars.some(([bx, t, b]) => {
  const w = 22, r = w / 2
  if (x < bx - r || x > bx + r) return false
  if (y >= t + r && y <= b - r) return true
  const cy = y < t + r ? t + r : b - r
  return (x - bx) ** 2 + (y - cy) ** 2 <= r * r
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
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr.set([8, 6, 0, 0, 0], 8)
writeFileSync(new URL('../resources/icon.png', import.meta.url), Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
]))
console.log('wrote resources/icon.png')
