import type { Settings } from '@shared/types'
import type { Db } from './index'

export const DEFAULT_SETTINGS: Settings = {
  lastfmApiKey: '',
  audioQuality: 'high',
  theme: 'system',
  motion: 'system',
  closeToTray: true,
  globalMediaKeys: false,
  autoplay: true,
  volume: 0.8,
  musicFolder: ''
}

export function getSettings(db: Db): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = JSON.parse(r.value)
  return out as unknown as Settings
}

export function setSettings(db: Db, patch: Partial<Settings>): Settings {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS && v !== undefined) stmt.run(k, JSON.stringify(v))
  }
  return getSettings(db)
}

/** Free-form internal state (window bounds etc.), stored beside settings. */
export function getState<T>(db: Db, key: string): T | undefined {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(`state:${key}`) as { value: string } | undefined
  return r ? (JSON.parse(r.value) as T) : undefined
}

export function setState(db: Db, key: string, value: unknown): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(`state:${key}`, JSON.stringify(value))
}
