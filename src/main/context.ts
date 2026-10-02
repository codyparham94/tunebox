import type { Db } from './db'
import { getSettings } from './db/settings'

let database: Db | undefined
let paths = { userData: '', ytdlpBundled: '' }

export function initContext(db: Db, p: typeof paths): void {
  database = db
  paths = p
}

export function db(): Db {
  if (!database) throw new Error('Database not initialised')
  return database
}

export function appPaths(): typeof paths {
  return paths
}

/** Settings value wins; `LASTFM_API_KEY` from a dev `.env` is the fallback. */
export function lastfmKey(): string {
  return (database && getSettings(database).lastfmApiKey.trim()) || process.env.LASTFM_API_KEY?.trim() || ''
}
