/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function basicNormalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const NOISE_IN_BRACKETS =
  /\s*[([][^)\]]*\b(feat|ft|featuring|with|remaster(ed)?|radio edit|single version|album version|official|audio|video|lyrics?|explicit|clean|mono|stereo|deluxe|bonus track|\d{4} mix)\b[^)\]]*[)\]]/gi
const TRAILING_NOISE =
  /\s+-\s+.*\b(remaster(ed)?|radio edit|single version|album version|mono|stereo|bonus track|from .*)\b.*$/i
const INLINE_FEAT = /\s+(feat\.?|ft\.?|featuring)\s+.*$/i

/** Normalize a song title for comparison: drops "feat.", "remastered", etc. */
export function normalizeTitle(title: string): string {
  return basicNormalize(title.replace(NOISE_IN_BRACKETS, '').replace(TRAILING_NOISE, '').replace(INLINE_FEAT, ''))
}

/** Normalize an artist credit to the primary artist. */
export function normalizeArtist(artist: string): string {
  const primary = artist.split(/\s*(?:,|&|\bx\b|\band\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\/)\s*/i)[0] ?? artist
  return basicNormalize(primary).replace(/^the /, '').replace(/ - topic$/, '')
}

/** Stable key for "same song" across sources. */
export function trackKey(artist: string, title: string): string {
  return `${normalizeArtist(artist)}|${normalizeTitle(title)}`
}

export const artistKey = normalizeArtist

/** Sørensen–Dice coefficient over character bigrams, in [0, 1]. */
export function similarity(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0
  if (a.length < 2 || b.length < 2) return 0
  const grams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2)
    grams.set(g, (grams.get(g) ?? 0) + 1)
  }
  let overlap = 0
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2)
    const n = grams.get(g) ?? 0
    if (n > 0) {
      grams.set(g, n - 1)
      overlap++
    }
  }
  return (2 * overlap) / (a.length + b.length - 2)
}

/** Upscale YouTube/Google image URLs, which encode size in the URL. */
export function upscaleArt(url: string | undefined, size = 544): string | undefined {
  if (!url) return undefined
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`).replace(/=s\d+/, `=s${size}`)
  }
  return url
}
