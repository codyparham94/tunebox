import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { player, usePlayerState } from '../store/player'
import { useUi } from '../store/ui'
import { CloseIcon } from './Icons'
import { Empty } from './States'
import { TrackList } from './TrackList'

const DEFAULT_WIDTH = 360
const MIN_WIDTH = 280
const KEY = 'tunebox:queue-width'
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(640, window.innerWidth * 0.5))
const clamp = (w: number) => Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, w)))

function applyWidth(w: number, save = false): void {
  document.documentElement.style.setProperty('--queue-width', `${w}px`)
  if (!save) return
  try {
    localStorage.setItem(KEY, String(w))
  } catch {
    /* storage blocked: the width just won't be remembered */
  }
}

function savedWidth(): number {
  try {
    return clamp(Number(localStorage.getItem(KEY)) || DEFAULT_WIDTH)
  } catch {
    return DEFAULT_WIDTH
  }
}

/** Drag the queue's left edge to resize it. Arrow keys work too; double-click resets. */
function ResizeHandle() {
  const drag = useRef<{ x: number; w: number } | null>(null)
  const width = () => (drag.current ? drag.current.w : savedWidth())

  useEffect(() => applyWidth(savedWidth()), [])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: (e.currentTarget.parentElement as HTMLElement).offsetWidth }
    document.documentElement.dataset.resizing = ''
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    // 1:1 with the pointer; the queue sits on the right, so dragging left widens it
    applyWidth(clamp(drag.current.w + drag.current.x - e.clientX))
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    applyWidth(clamp(drag.current.w + drag.current.x - e.clientX), true)
    drag.current = null
    delete document.documentElement.dataset.resizing
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    applyWidth(clamp(width() + (e.key === 'ArrowLeft' ? 24 : -24)), true)
  }

  return (
    <div
      className="queue-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize queue"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={() => applyWidth(DEFAULT_WIDTH, true)}
    />
  )
}

/** Stays mounted briefly after closing so it can leave the way it came in. */
export function QueuePanel({ open }: { open: boolean }) {
  const { queue, index, station, refilling } = usePlayerState()
  const toggleQueue = useUi((s) => s.toggleQueue)
  const upcoming = queue.length - index - 1

  return (
    <aside className="queue" aria-label="Queue" data-state={open ? 'open' : 'closed'} inert={!open}>
      <ResizeHandle />
      <div className="queue-head">
        <div>
          <h2 className="section-title">Queue</h2>
          <p className="tile-sub">
            {station ? `${station.name} · ` : ''}
            {upcoming > 0 ? `${upcoming} up next` : 'Nothing up next'}
            {refilling ? ' · finding more…' : ''}
          </p>
        </div>
        <div className="row">
          {upcoming > 0 && (
            <button className="btn btn-sm" onClick={player.clearUpcoming}>
              Clear
            </button>
          )}
          <button className="icon-btn" aria-label="Close queue" onClick={toggleQueue}>
            <CloseIcon size={18} />
          </button>
        </div>
      </div>
      <div className="queue-body">
        {queue.length === 0 ? (
          <Empty>Songs you play or add to the queue show up here.</Empty>
        ) : (
          <TrackList
            label="Queue"
            tracks={queue}
            compact
            onPlay={player.jumpTo}
            isCurrent={(_, i) => i === index}
            onMove={player.move}
            onRemove={(i) => (i === index ? undefined : player.removeAt(i))}
            removeLabel="Remove from queue"
            reasons={false}
          />
        )}
      </div>
    </aside>
  )
}
