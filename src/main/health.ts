import type { AudioQuality, ResolverHealth } from '@shared/types'
import { resolveWithYoutubei, resolveWithYtdlp, servesWholeFile, type ResolvedStream } from './stream/resolver'
import { ytdlpPath, ytdlpVersion } from './stream/ytdlp'

/** Long-lived, widely available videos used to detect YouTube breakage. */
export const PROBE_IDS = ['dQw4w9WgXcQ', 'kJQP7kiw5Fk', 'fJ9rUzIMcZQ', '4D7u5KF7SP8', '60ItHLz5WEA']

/**
 * Resolves, then reads the *end* of the file. YouTube sometimes serves only the first
 * ~1 MB of a URL, so checking the start alone would miss that breakage.
 */
export async function probe(
  resolver: (id: string, q: AudioQuality) => Promise<ResolvedStream>,
  videoId: string
): Promise<{ ok: boolean; detail: string }> {
  try {
    const s = await resolver(videoId, 'high')
    return (await servesWholeFile(s.url, s.headers))
      ? { ok: true, detail: s.mime }
      : { ok: false, detail: 'only the start of the file is served' }
  } catch (err) {
    return { ok: false, detail: (err as Error).message.slice(0, 160) }
  }
}

export async function checkResolvers(): Promise<ResolverHealth> {
  const id = PROBE_IDS[0]
  const hasYtdlp = ytdlpPath() !== null
  const [yti, ytd, version] = await Promise.all([
    probe(resolveWithYoutubei, id),
    hasYtdlp ? probe(resolveWithYtdlp, id) : Promise.resolve({ ok: false, detail: 'yt-dlp not installed' }),
    hasYtdlp ? ytdlpVersion().catch(() => undefined) : Promise.resolve(undefined)
  ])
  return {
    checkedAt: Date.now(),
    youtubei: yti.ok,
    ytdlp: ytd.ok,
    ytdlpVersion: version,
    error: !yti.ok && !ytd.ok ? `youtubei.js: ${yti.detail}; yt-dlp: ${ytd.detail}` : undefined
  }
}

/** `npm run smoke`: every probe id through both resolvers. */
export async function runSmoke(): Promise<boolean> {
  const rows: string[] = []
  let allPlayable = true
  for (const id of PROBE_IDS) {
    const [a, b] = await Promise.all([probe(resolveWithYoutubei, id), probe(resolveWithYtdlp, id)])
    if (!a.ok && !b.ok) allPlayable = false
    rows.push(`${id}  youtubei.js: ${a.ok ? 'OK ' : 'FAIL'} ${a.detail.padEnd(28).slice(0, 28)}  yt-dlp: ${b.ok ? 'OK ' : 'FAIL'} ${b.detail}`)
  }
  console.log('\nTunebox resolver smoke test\n' + rows.join('\n'))
  console.log(allPlayable ? '\nPASS: every video resolved with at least one resolver.' : '\nFAIL: some videos could not be resolved.')
  return allPlayable
}
