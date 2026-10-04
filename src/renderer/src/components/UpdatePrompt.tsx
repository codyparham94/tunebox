import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '../lib/queries'
import { updates, useUpdate } from '../store/update'
import { DownloadIcon } from './Icons'

/** Asks before installing a new release from GitHub, then shows download and install progress. */
export function UpdatePrompt() {
  const { status, open } = useUpdate()
  const ref = useRef<HTMLDialogElement>(null)
  const current = useQuery({ queryKey: ['appVersion'], queryFn: () => api.system.appVersion(), staleTime: Infinity })

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])

  const busy = status.state === 'downloading' || status.state === 'ready'

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="upd-title"
      onCancel={(e) => {
        // Esc means "Not now", but not while the installer is on its way.
        e.preventDefault()
        if (!busy) updates.later()
      }}
    >
      <span className="eyebrow muted">Update available</span>
      <h2 id="upd-title" className="section-title" style={{ margin: 'var(--space-1) 0' }}>
        Tunebox {status.version} is here
      </h2>
      <p className="tile-sub" style={{ marginBottom: 'var(--space-4)' }}>
        You have {current.data ?? 'an older version'}. Updating keeps your library, playlists and settings.
        {status.manual && ' Download the new .dmg and drag Tunebox into Applications to replace this one.'}
      </p>

      {status.notes && !busy && (
        <div className="update-notes" tabIndex={0} aria-label="What’s new">
          {status.notes}
        </div>
      )}

      {busy && (
        <div style={{ marginBottom: 'var(--space-4)' }} role="status">
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${status.state === 'ready' ? 100 : (status.percent ?? 0)}%` }} />
          </div>
          <p className="tile-sub" style={{ marginTop: 'var(--space-2)' }}>
            {status.state === 'ready' ? 'Installing… Tunebox will restart in a moment.' : `Downloading… ${status.percent ?? 0}%`}
          </p>
        </div>
      )}

      {status.state === 'error' && (
        <p className="state error" role="alert" style={{ minHeight: 0, padding: 0, marginBottom: 'var(--space-4)', justifyItems: 'start', textAlign: 'left' }}>
          The update didn’t install: {status.error}
        </p>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {!busy && (
          <button className="btn" onClick={updates.later}>
            Not now
          </button>
        )}
        <button className="btn btn-primary" disabled={busy} onClick={() => void updates.install()} autoFocus>
          <DownloadIcon size={16} />{' '}
          {status.state === 'error' ? 'Try again' : busy ? 'Updating…' : status.manual ? 'Open download page' : 'Update and restart'}
        </button>
      </div>
    </dialog>
  )
}
