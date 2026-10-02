import { useEffect, useState } from 'react'
import type { Settings as SettingsT } from '@shared/types'
import { Equalizer } from '../components/Equalizer'
import { Loading } from '../components/States'
import { timeAgo } from '../lib/format'
import { THEMES } from '../lib/themes'
import { api, errorMessage, keys, queryClient, useHealth, useSettings } from '../lib/queries'
import { toast } from '../store/toast'

async function save(patch: Partial<SettingsT>): Promise<void> {
  try {
    const s = await api.settings.set(patch)
    queryClient.setQueryData(keys.settings, s)
    if ('lastfmApiKey' in patch) void queryClient.invalidateQueries({ queryKey: ['tags'] })
  } catch (err) {
    toast.error(errorMessage(err))
  }
}

export function Settings() {
  const settings = useSettings()
  if (!settings.data) return <div className="page"><Loading /></div>
  const s = settings.data

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <h1 className="page-title">Settings</h1>
      <div className="grid gap-4">
        <LastfmTile value={s.lastfmApiKey} />

        <section className="tile" aria-labelledby="pb-title">
          <h2 id="pb-title" className="tile-title">
            Playback
          </h2>
          <fieldset className="grid gap-2 border-0 p-0 m-0">
            <legend className="field" style={{ marginBottom: 'var(--space-2)' }}>
              Audio quality
            </legend>
            {(
              [
                ['high', 'High', 'Best available audio (about 128–160 kbps).'],
                ['low', 'Data saver', 'Lowest bitrate stream.']
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-2" style={{ fontSize: 'var(--text-sm)' }}>
                <input type="radio" name="quality" checked={s.audioQuality === value} onChange={() => void save({ audioQuality: value })} />
                <span>
                  <strong>{label}</strong> <span className="muted">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="tile" aria-labelledby="lf2-title">
          <h2 id="lf2-title" className="tile-title">
            Local files
          </h2>
          <p className="tile-sub" style={{ marginBottom: 'var(--space-3)' }}>
            {s.musicFolder ? (
              <>
                Music folder: <span className="mono">{s.musicFolder}</span>
              </>
            ) : (
              'No music folder chosen yet.'
            )}
          </p>
          <button
            className="btn"
            onClick={async () => {
              try {
                const r = await api.local.chooseFolder()
                if (r) {
                  void queryClient.invalidateQueries({ queryKey: keys.settings })
                  void queryClient.invalidateQueries({ queryKey: ['local'] })
                  toast.success(`Found ${r.total} songs in ${r.folder}`)
                }
              } catch (err) {
                toast.error(errorMessage(err))
              }
            }}
          >
            {s.musicFolder ? 'Change folder' : 'Choose folder'}
          </button>
        </section>

        <section className="tile" aria-labelledby="ap-title">
          <h2 id="ap-title" className="tile-title">
            Appearance &amp; system
          </h2>
          <ThemePicker current={s.theme} />
          <Toggle
            label="Keep playing in the tray when the window is closed"
            checked={s.closeToTray}
            onChange={(v) => void save({ closeToTray: v })}
          />
          <Toggle
            label="Global media keys (fallback)"
            hint="Only needed if your keyboard’s play/next keys don’t work. Windows usually routes them to Tunebox already."
            checked={s.globalMediaKeys}
            onChange={(v) => void save({ globalMediaKeys: v })}
          />
        </section>

        <section className="tile" aria-labelledby="eq-title">
          <h2 id="eq-title" className="tile-title">
            Equalizer
          </h2>
          <Equalizer />
        </section>

        <EngineTile />

        <section className="tile" aria-labelledby="kb-title">
          <h2 id="kb-title" className="tile-title">
            Keyboard shortcuts
          </h2>
          <dl className="grid gap-2 m-0" style={{ gridTemplateColumns: 'auto 1fr', fontSize: 'var(--text-sm)' }}>
            {[
              [['Space'], 'Play / pause'],
              [['←', '→'], 'Seek 5 seconds'],
              [['Ctrl', '←'], 'Previous track'],
              [['Ctrl', '→'], 'Next track'],
              [['/'], 'Search'],
              [['Alt', '↑/↓'], 'Move a focused playlist or queue row']
            ].map(([k, d]) => (
              <div key={d as string} className="contents">
                <dt className="row" style={{ gap: 4 }}>
                  {(k as string[]).map((x) => (
                    <span key={x} className="kbd">
                      {x}
                    </span>
                  ))}
                </dt>
                <dd className="m-0 muted">{d as string}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  )
}

type ThemeFilter = 'all' | 'light' | 'dark'

function ThemePicker({ current }: { current: string }) {
  const [filter, setFilter] = useState<ThemeFilter>(() => {
    const t = THEMES.find((x) => x.id === current)
    return t ? (t.dark ? 'dark' : 'light') : 'all'
  })
  const shown = THEMES.filter((t) => filter === 'all' || (filter === 'dark') === t.dark)
  const count = (f: ThemeFilter) => (f === 'all' ? THEMES.length : THEMES.filter((t) => (f === 'dark') === t.dark).length)

  return (
    <fieldset className="border-0 p-0 m-0" style={{ marginBottom: 'var(--space-4)' }}>
      <legend className="field" style={{ marginBottom: 'var(--space-2)' }}>
        Theme
      </legend>
      <div className="tabs" role="group" aria-label="Filter themes">
        {(['all', 'light', 'dark'] as const).map((f) => (
          <button key={f} type="button" className="tab" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {{ all: 'All', light: 'Light', dark: 'Dark' }[f]} ({count(f)})
          </button>
        ))}
      </div>
      <div className="theme-grid">
        {filter === 'all' && (
          <ThemeOption id="system" name="Match Windows" source="Bento, light or dark" swatch={['#FAD4C0', '#FFF5E6', '#16120F']} checked={current === 'system'} />
        )}
        {shown.map((t) => (
          <ThemeOption key={t.id} id={t.id} name={t.name} source={t.source} swatch={t.swatch} checked={current === t.id} />
        ))}
      </div>
    </fieldset>
  )
}

function ThemeOption({
  id,
  name,
  source,
  swatch,
  checked
}: {
  id: string
  name: string
  source: string
  swatch: [string, string, string]
  checked: boolean
}) {
  return (
    <label className="theme-option">
      <input type="radio" name="theme" className="sr-only" checked={checked} onChange={() => void save({ theme: id })} />
      <span className="theme-swatch" aria-hidden="true">
        {swatch.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </span>
      <span>
        {name}
        <span className="field-hint block truncate" style={{ fontWeight: 400 }} title={source}>
          {source}
        </span>
      </span>
    </label>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 4 }} />
      <span>
        {label}
        {hint && <span className="field-hint block">{hint}</span>}
      </span>
    </label>
  )
}

function LastfmTile({ value }: { value: string }) {
  const [key, setKey] = useState(value)
  const [show, setShow] = useState(false)
  useEffect(() => setKey(value), [value])
  const dirty = key.trim() !== value

  return (
    <section className="tile" aria-labelledby="lf-title">
      <h2 id="lf-title" className="tile-title">
        Last.fm
      </h2>
      <p className="tile-sub" style={{ marginBottom: 'var(--space-3)' }}>
        Radio uses Last.fm for similar songs and genres. A free API key is enough:{' '}
        <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">
          get one here
        </a>
        . It’s stored only on this computer.
      </p>
      <form
        className="row"
        style={{ flexWrap: 'nowrap' }}
        onSubmit={async (e) => {
          e.preventDefault()
          await save({ lastfmApiKey: key.trim() })
          toast.success(key.trim() ? 'Last.fm key saved' : 'Last.fm key removed')
        }}
      >
        <label htmlFor="lf-key" className="sr-only">
          Last.fm API key
        </label>
        <input
          id="lf-key"
          className="input mono"
          type={show ? 'text' : 'password'}
          placeholder="32-character API key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" className="btn" onClick={() => setShow((v) => !v)} aria-pressed={show}>
          {show ? 'Hide' : 'Show'}
        </button>
        <button className="btn btn-primary" disabled={!dirty}>
          Save
        </button>
      </form>
    </section>
  )
}

function EngineTile() {
  const health = useHealth()
  const [updating, setUpdating] = useState(false)
  const h = health.data

  const dot = (ok: boolean | undefined) => (
    <span className="status-dot" style={{ background: ok === undefined ? 'var(--border-strong)' : ok ? 'var(--success)' : 'var(--danger)' }} aria-hidden="true" />
  )

  return (
    <section className="tile" aria-labelledby="en-title">
      <h2 id="en-title" className="tile-title">
        Playback engine
      </h2>
      <p className="tile-sub" style={{ marginBottom: 'var(--space-3)' }}>
        Tunebox reads audio with youtubei.js and falls back to yt-dlp. If playback stops working, YouTube has probably
        changed something: update yt-dlp first.
      </p>
      {!h ? (
        <p className="tile-sub">Checking…</p>
      ) : (
        <ul className="grid gap-1 list-none m-0 p-0" style={{ fontSize: 'var(--text-sm)' }}>
          <li className="row">
            {dot(h.youtubei)} youtubei.js: {h.youtubei ? 'working' : 'failing'}
          </li>
          <li className="row">
            {dot(h.ytdlp)} yt-dlp {h.ytdlpVersion ? <span className="mono">{h.ytdlpVersion}</span> : ''}: {h.ytdlp ? 'working' : h.ytdlpVersion ? 'failing' : 'not installed'}
          </li>
          <li className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            Checked {timeAgo(h.checkedAt)}
          </li>
          {h.error && (
            <li className="state error" style={{ minHeight: 0, padding: 0, justifyItems: 'start', textAlign: 'left' }}>
              {h.error}
            </li>
          )}
        </ul>
      )}
      <div className="row" style={{ marginTop: 'var(--space-4)' }}>
        <button
          className="btn btn-primary"
          disabled={updating}
          onClick={async () => {
            setUpdating(true)
            try {
              toast.success(await api.system.updateYtdlp())
            } catch (err) {
              toast.error(errorMessage(err))
            } finally {
              setUpdating(false)
            }
          }}
        >
          {updating ? <span className="spinner" /> : null} Update yt-dlp
        </button>
      </div>
    </section>
  )
}
