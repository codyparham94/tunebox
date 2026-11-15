import { describe, expect, it, vi } from 'vitest'
import type { CriticAlbum, CriticFeed, CriticList, CriticListSummary, CriticSource } from '../src/shared/types'
import { createCritics, interleave, mergeIndex, type CriticsStore } from '../src/main/sources/critics'
import { requireSome } from '../src/main/sources/critics/http'

const album = (source: CriticSource, n: string, artist = `Artist ${source} ${n}`): CriticAlbum => ({ source, title: `Album ${n}`, artist, verdict: 'v', reviewUrl: `https://x/${source}/${n}` })
const SOURCES: CriticSource[] = ['pitchfork', 'needledrop', 'bandcamp', 'stereogum']

function setup(over: Partial<Record<CriticSource, () => Promise<CriticAlbum[]>>> = {}) {
  const data = new Map<string, unknown>()
  const store: CriticsStore = { get: (k) => data.get(k) as never, set: (k, v) => void data.set(k, v) }
  const readers = Object.fromEntries(
    SOURCES.map((s) => [s, vi.fn(over[s] ?? (async () => [album(s, '1')]))])
  ) as Record<CriticSource, ReturnType<typeof vi.fn>>
  const summary: CriticListSummary = { id: 'pitchfork:best-2025', source: 'pitchfork', title: 'Best', year: 2025, ranked: true }
  const readListIndex = vi.fn(async () => [summary])
  const readList = vi.fn(async (id: string): Promise<CriticList> => ({ ...summary, id, albums: [album('pitchfork', 'L')] }))
  const critics = createCritics({ readers, readListIndex, readList, store, now: () => 123 })
  return { data, store, readers, readListIndex, readList, critics }
}

describe('interleave', () => {
  it('goes round-robin', () => {
    const [p1, p2, p3, n1, b1, b2] = ['p1', 'p2', 'p3', 'n1', 'b1', 'b2'].map((n) => album('pitchfork', n))
    expect(interleave([[p1, p2, p3], [n1], [b1, b2]])).toEqual([p1, n1, b1, p2, b2, p3])
  })
  it('keeps one copy of an album in two sources', () => {
    const a = album('pitchfork', '1', 'Krill')
    const b = { ...album('bandcamp', '9', 'krill'), title: a.title }
    expect(interleave([[a], [b]])).toEqual([a])
  })
})

describe('scan', () => {
  it('joins a scan in progress', async () => {
    const { critics, readers } = setup()
    const [a, b] = await Promise.all([critics.scan(), critics.scan()])
    expect(a).toBe(b)
    for (const s of SOURCES) expect(readers[s]).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous albums of every source when offline', async () => {
    const { critics, readers, store } = setup()
    const three = [album('pitchfork', 'a'), album('pitchfork', 'b'), album('pitchfork', 'c')]
    store.set('critics:feed', { albums: three, failed: [], builtAt: 1 })
    for (const s of SOURCES) readers[s].mockRejectedValue(new Error('offline'))
    const f = await critics.scan()
    expect(f.failed).toEqual(SOURCES)
    expect(f.albums).toEqual(three)
    expect(store.get<CriticFeed>('critics:feed')?.albums).toEqual(three)
  })

  it('treats an empty page as a failure', async () => {
    const { critics, readers, store } = setup()
    const old = [album('bandcamp', 'old')]
    store.set('critics:feed', { albums: old, failed: [], builtAt: 1 })
    readers.bandcamp.mockImplementation(async () => requireSome([], 'Bandcamp'))
    const f = await critics.scan()
    expect(f.failed).toEqual(['bandcamp'])
    expect(f.albums).toContainEqual(old[0])
  })

  it('pushes the stored feed once per scan', async () => {
    const { critics, store } = setup()
    const cb = vi.fn()
    critics.onScanned(cb)
    await Promise.all([critics.scan(), critics.scan()])
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(store.get('critics:feed'))
    await critics.scan()
    expect(cb).toHaveBeenCalledTimes(2)
  })
})

describe('feed', () => {
  it('serves a stored feed without reading', async () => {
    const { critics, readers, store } = setup()
    const stored = { albums: [album('pitchfork', 'a')], failed: [], builtAt: 1 }
    store.set('critics:feed', stored)
    expect(await critics.feed()).toEqual(stored)
    for (const s of SOURCES) expect(readers[s]).not.toHaveBeenCalled()
  })

  it('scans once on first run, even if scan() is called meanwhile', async () => {
    const { critics, readers } = setup()
    const [f] = await Promise.all([critics.feed(), critics.scan()])
    expect(f.albums).toHaveLength(4)
    for (const s of SOURCES) expect(readers[s]).toHaveBeenCalledTimes(1)
  })

  it('scanOnce does not rescan after a first-run feed()', async () => {
    const { critics, readers } = setup()
    await critics.feed()
    await critics.scanOnce()
    for (const s of SOURCES) expect(readers[s]).toHaveBeenCalledTimes(1)
  })
})

describe('lists', () => {
  it('fetches a list once, then serves it; refresh fetches again', async () => {
    const { critics, readList } = setup()
    await critics.list('pitchfork:best-2025')
    await critics.list('pitchfork:best-2025')
    expect(readList).toHaveBeenCalledTimes(1)
    await critics.list('pitchfork:best-2025', true)
    expect(readList).toHaveBeenCalledTimes(2)
  })

  it('lists() serves the stored index; lists(true) refetches it once', async () => {
    const { critics, readListIndex } = setup()
    await critics.scan()
    readListIndex.mockClear()
    await critics.lists()
    expect(readListIndex).not.toHaveBeenCalled()
    await critics.lists(true)
    expect(readListIndex).toHaveBeenCalledTimes(1)
  })

  it('keeps the stored index when a refresh fails', async () => {
    const { critics, readListIndex, store } = setup()
    await critics.scan()
    readListIndex.mockRejectedValue(new Error('down'))
    await expect(critics.lists(true)).rejects.toThrow('down')
    expect(store.get('critics:lists')).toHaveLength(1)
  })
})

describe('mergeIndex', () => {
  const sum = (id: string, year: number): CriticListSummary => ({ id, source: id.startsWith('pitchfork') ? 'pitchfork' : 'needledrop', title: id, year, ranked: true })
  const ok = (v: CriticListSummary[]): PromiseSettledResult<CriticListSummary[]> => ({ status: 'fulfilled', value: v })
  const bad: PromiseSettledResult<CriticListSummary[]> = { status: 'rejected', reason: new Error('down') }

  it('keeps stored Needle Drop lists when its read fails', () => {
    const stored = [sum('pitchfork:old', 2024), sum('needledrop:top50-2025', 2025)]
    const out = mergeIndex(stored, ok([sum('pitchfork:new', 2025)]), bad)
    expect(out.map((l) => l.id)).toEqual(['pitchfork:new', 'needledrop:top50-2025'])
  })
  it('keeps stored Pitchfork lists when its read fails', () => {
    const stored = [sum('pitchfork:old', 2024)]
    expect(mergeIndex(stored, bad, ok([sum('needledrop:top50-2025', 2025)])).map((l) => l.id)).toEqual(['needledrop:top50-2025', 'pitchfork:old'])
  })
  it('fails only when both fail', () => {
    expect(() => mergeIndex([], bad, bad)).toThrow('down')
  })
})
