import type { CriticAlbum, CriticFeed, CriticList, CriticListSummary, CriticSource } from '@shared/types'
import { db } from '../../context'
import { getState, setState } from '../../db/settings'
import { trackKey } from '../../util/text'
import { readBandcamp } from './bandcamp'
import { readReviews, readTop50Lists } from './needledrop'
import * as pitchfork from './pitchfork'
import { readStereogum } from './stereogum'

export interface CriticsStore {
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
}

export interface CriticsDeps {
  readers: Record<CriticSource, (store: CriticsStore) => Promise<CriticAlbum[]>>
  readListIndex(): Promise<CriticListSummary[]>
  readList(id: string): Promise<CriticList>
  store: CriticsStore
  now(): number
}

const SOURCES: CriticSource[] = ['pitchfork', 'needledrop', 'bandcamp', 'stereogum']
const FEED = 'critics:feed'
const LISTS = 'critics:lists'

/** Round-robin across sources, first sighting of an album wins. */
export function interleave(bySource: CriticAlbum[][]): CriticAlbum[] {
  const out: CriticAlbum[] = []
  const seen = new Set<string>()
  for (let i = 0; bySource.some((l) => i < l.length); i++) {
    for (const l of bySource) {
      const a = l[i]
      if (!a || seen.has(trackKey(a.artist, a.title))) continue
      seen.add(trackKey(a.artist, a.title))
      out.push(a)
    }
  }
  return out
}

type Settled = PromiseSettledResult<CriticListSummary[]>

/** A source that fails keeps its stored entries; the merge fails only when both do. */
export function mergeIndex(stored: CriticListSummary[], pf: Settled, nd: Settled): CriticListSummary[] {
  if (pf.status === 'rejected' && nd.status === 'rejected') throw pf.reason
  const part = (r: Settled, prefix: string) => (r.status === 'fulfilled' ? r.value : stored.filter((l) => l.id.startsWith(prefix)))
  // stable sort: within a year Pitchfork stays ahead of The Needle Drop
  return [...part(pf, 'pitchfork:'), ...part(nd, 'needledrop:')].sort((a, b) => b.year - a.year)
}

export function createCritics(deps: CriticsDeps) {
  const { store } = deps
  const listeners: ((f: CriticFeed) => void)[] = []
  let running: Promise<CriticFeed> | undefined
  let last: Promise<CriticFeed> | undefined

  async function refreshIndex(): Promise<CriticListSummary[]> {
    const index = await deps.readListIndex()
    store.set(LISTS, index)
    return index
  }

  async function run(): Promise<CriticFeed> {
    const previous = store.get<CriticFeed>(FEED)?.albums ?? []
    const results = await Promise.allSettled(SOURCES.map((s) => deps.readers[s](store)))
    const failed: CriticSource[] = []
    const bySource = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value
      failed.push(SOURCES[i])
      console.warn(`[critics] ${SOURCES[i]}:`, (r.reason as Error)?.message)
      return previous.filter((a) => a.source === SOURCES[i])
    })
    const feed: CriticFeed = { albums: interleave(bySource), failed, builtAt: deps.now() }
    store.set(FEED, feed)
    await refreshIndex().catch((err: Error) => console.warn('[critics] list index:', err.message))
    for (const cb of listeners) cb(feed)
    return feed
  }

  const scan = (): Promise<CriticFeed> => {
    if (!running) {
      running = run().finally(() => (running = undefined))
      last = running
    }
    return running
  }

  return {
    scan,
    /** Scans only if no scan has run or is running since this instance was made. */
    scanOnce: () => last ?? scan(),
    feed: async (): Promise<CriticFeed> => store.get<CriticFeed>(FEED) ?? running ?? scan(),
    lists: async (refresh = false): Promise<CriticListSummary[]> => {
      if (refresh) return refreshIndex()
      const stored = store.get<CriticListSummary[]>(LISTS)
      if (stored) return stored
      if (running) await running
      return store.get<CriticListSummary[]>(LISTS) ?? refreshIndex()
    },
    list: async (id: string, refresh = false): Promise<CriticList> => {
      const key = `critics:list:${id}`
      const stored = store.get<CriticList>(key)
      if (stored && !refresh) return stored
      const list = await deps.readList(id)
      store.set(key, list)
      return list
    },
    onScanned: (cb: (f: CriticFeed) => void): void => void listeners.push(cb)
  }
}

// the db only exists after startup, so it is looked up on use, never at import
const store: CriticsStore = {
  get: (key) => getState(db(), key),
  set: (key, value) => setState(db(), key, value)
}

const critics = createCritics({
  readers: {
    pitchfork: pitchfork.readBestNew,
    needledrop: async (s) => {
      const { albums, seen } = await readReviews(s.get('critics:needledrop') ?? {})
      s.set('critics:needledrop', seen)
      return albums
    },
    bandcamp: readBandcamp,
    stereogum: readStereogum
  },
  async readListIndex() {
    const year = new Date().getFullYear()
    const [pf, top50] = await Promise.allSettled([pitchfork.readListIndex(), readTop50Lists([year, year - 1])])
    const nd: Settled =
      top50.status === 'rejected'
        ? top50
        : {
            status: 'fulfilled',
            value: top50.value.map(({ albums, ...summary }) => {
              store.set(`critics:list:${summary.id}`, { ...summary, albums })
              return summary
            })
          }
    return mergeIndex(store.get<CriticListSummary[]>(LISTS) ?? [], pf, nd)
  },
  async readList(id) {
    if (id.startsWith('pitchfork:')) return pitchfork.readList(id)
    const year = Number(/^needledrop:top50-(\d{4})$/.exec(id)?.[1])
    const list = year ? (await readTop50Lists([year]))[0] : undefined
    if (!list) throw new Error('The Needle Drop: list not found')
    return list
  },
  store,
  now: Date.now
})

export const criticsFeed = critics.feed
export const scanCritics = critics.scan
export const scanCriticsOnce = critics.scanOnce
export const criticLists = critics.lists
export const criticList = critics.list
export const onCriticsScanned = critics.onScanned
