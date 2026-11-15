const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`)
  return res.text()
}

const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }

export function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) => {
    if (dec) return String.fromCodePoint(+dec)
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    return NAMED[name.toLowerCase()] ?? m
  })
}

export function requireSome<T>(items: T[], what: string): T[] {
  if (!items.length) throw new Error(`${what}: nothing found`)
  return items
}
