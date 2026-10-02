import { player, usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { CloseIcon } from './Icons'
import { Empty } from './States'
import { TrackList } from './TrackList'

export function QueuePanel() {
  const { queue, index, station, refilling } = usePlayer()
  const toggleQueue = useUi((s) => s.toggleQueue)
  const upcoming = queue.length - index - 1

  return (
    <aside className="queue" aria-label="Queue">
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
          />
        )}
      </div>
    </aside>
  )
}
