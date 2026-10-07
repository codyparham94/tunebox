import { useState, type KeyboardEvent } from 'react'
import type { RadioTrack, Track } from '@shared/types'
import { setLiked, startTrackRadio } from '../lib/actions'
import { formatTime } from '../lib/format'
import { useTrackNav } from '../lib/nav'
import { useLikedIds } from '../lib/queries'
import { currentTrack, player, usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { Art } from './Art'
import { Equalizer, GripIcon, HeartFilledIcon, HeartIcon, PlayIcon } from './Icons'
import { Menu, type MenuItem } from './Menu'

interface TrackListProps {
  tracks: (Track | RadioTrack)[]
  /** defaults to replacing the queue with this list */
  onPlay?: (index: number) => void
  isCurrent?: (t: Track, i: number) => boolean
  numbered?: boolean
  showAlbum?: boolean
  compact?: boolean
  onMove?: (from: number, to: number) => void
  onRemove?: (index: number) => void
  removeLabel?: string
  /** song title opens its album (off on the album page itself) */
  linkTitles?: boolean
  /** show why a radio pick was chosen (off in the queue, where it's just noise) */
  reasons?: boolean
  label: string
}

export function TrackList({
  tracks,
  onPlay,
  isCurrent,
  numbered,
  showAlbum = true,
  compact,
  onMove,
  onRemove,
  removeLabel = 'Remove from playlist',
  linkTitles = true,
  reasons = true,
  label
}: TrackListProps) {
  const current = usePlayer((s) => currentTrack(s))
  const playing = usePlayer((s) => s.playing)
  const liked = useLikedIds().data
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const play = onPlay ?? ((i: number) => player.playList(tracks, i))
  const matches = isCurrent ?? ((t: Track) => !!current && !!t.id && t.id === current.id)

  return (
    <ol className="tracklist" aria-label={label}>
      {tracks.map((t, i) => (
        <TrackRow
          key={`${t.id || t.title}-${i}`}
          track={t}
          index={i}
          current={matches(t, i)}
          playing={playing}
          liked={!!t.id && !!liked?.has(t.id)}
          numbered={numbered}
          showAlbum={showAlbum}
          compact={compact}
          onPlay={() => play(i)}
          onRemove={onRemove && (() => onRemove(i))}
          removeLabel={removeLabel}
          linkTitle={linkTitles}
          showReason={reasons}
          onMove={onMove && ((to) => to >= 0 && to < tracks.length && onMove(i, to))}
          drag={
            onMove && {
              dragging: dragFrom === i,
              target: dropAt === i && dragFrom !== i,
              start: () => setDragFrom(i),
              over: () => setDropAt(i),
              end: () => {
                if (dragFrom !== null && dropAt !== null && dragFrom !== dropAt) onMove(dragFrom, dropAt)
                setDragFrom(null)
                setDropAt(null)
              }
            }
          }
        />
      ))}
    </ol>
  )
}

interface RowProps {
  track: Track | RadioTrack
  index: number
  current: boolean
  playing: boolean
  liked: boolean
  numbered?: boolean
  showAlbum: boolean
  compact?: boolean
  onPlay: () => void
  onRemove?: () => void
  removeLabel: string
  linkTitle: boolean
  showReason: boolean
  onMove?: (to: number) => void
  drag?: { dragging: boolean; target: boolean; start(): void; over(): void; end(): void }
}

function TrackRow(p: RowProps) {
  const { track: t } = p
  const nav = useTrackNav()
  const openAdd = useUi((s) => s.openAddToPlaylist)
  const reason = p.showReason && 'reason' in t ? t.reason : undefined

  const items: MenuItem[] = [
    { label: 'Play next', onSelect: () => player.playNext([t]) },
    { label: 'Add to queue', onSelect: () => player.enqueue([t]) },
    { label: 'Start radio', onSelect: () => void startTrackRadio(t) },
    { label: p.liked ? 'Remove from liked songs' : 'Like', onSelect: () => void setLiked(t, !p.liked), hidden: !p.compact },
    { label: 'Add to playlist…', onSelect: () => openAdd([t]) },
    { label: 'Go to artist', onSelect: () => void nav.artist(t) },
    { label: 'Go to album', onSelect: () => void nav.album(t) },
    { label: p.removeLabel, onSelect: () => p.onRemove?.(), hidden: !p.onRemove }
  ]

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') {
      e.preventDefault()
      p.onPlay()
    } else if (p.onMove && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const to = p.index + (e.key === 'ArrowUp' ? -1 : 1)
      p.onMove(to)
      // keep focus on the moved row after re-render
      const list = e.currentTarget.parentElement
      requestAnimationFrame(() => (list?.children[to] as HTMLElement | undefined)?.focus())
    }
  }

  const cls = ['track', p.compact && 'compact', p.current && 'current', p.drag?.dragging && 'dragging', p.drag?.target && 'drop-target']
    .filter(Boolean)
    .join(' ')

  return (
    <li
      className={cls}
      tabIndex={0}
      aria-label={`${t.title} by ${t.artist}${p.onMove ? '. Alt+Up or Alt+Down to move.' : ''}`}
      aria-current={p.current ? 'true' : undefined}
      onDoubleClick={p.onPlay}
      onKeyDown={onKeyDown}
      draggable={!!p.drag}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        p.drag?.start()
      }}
      onDragOver={(e) => {
        if (!p.drag) return
        e.preventDefault()
        p.drag.over()
      }}
      onDragEnd={() => p.drag?.end()}
    >
      {!p.compact &&
        (p.drag ? (
          <span className="drag-handle muted" aria-hidden="true">
            <GripIcon size={16} />
          </span>
        ) : (
          <span className="track-num mono">
            {p.current ? <Equalizer paused={!p.playing} /> : p.numbered ? p.index + 1 : ''}
          </span>
        ))}
      <button className="track-art-btn" onClick={p.onPlay} aria-label={`Play ${t.title}`} tabIndex={-1}>
        <Art src={t.artUrl} size={44} />
        <span className="overlay">
          <PlayIcon size={18} />
        </span>
      </button>
      <div className="min-w-0">
        <div className="truncate">
          {p.linkTitle ? (
            <button className="link-btn title-link" title={`${t.title}: go to album`} onClick={() => void nav.album(t)}>
              {t.title}
            </button>
          ) : (
            <span className="track-title" title={t.title}>
              {t.title}
            </span>
          )}
        </div>
        <div className="track-meta truncate">
          <button className="link-btn" title={`Go to ${t.artist}`} onClick={() => void nav.artist(t)}>
            {t.artist}
          </button>
          {reason && <span className="muted"> · {reason}</span>}
        </div>
      </div>
      {!p.compact && (
        <div className="track-meta truncate min-w-0">
          {p.showAlbum && t.album && (
            <button className="link-btn truncate" onClick={() => void nav.album(t)}>
              {t.album}
            </button>
          )}
        </div>
      )}
      {!p.compact && <span className="mono muted text-right" style={{ fontSize: 'var(--text-xs)' }}>{t.duration ? formatTime(t.duration) : ''}</span>}
      <div className="track-actions">
        {!p.compact && (
        <button
          className="icon-btn"
          aria-pressed={p.liked}
          aria-label={p.liked ? `Unlike ${t.title}` : `Like ${t.title}`}
          onClick={() => void setLiked(t, !p.liked)}
        >
          {p.liked ? <HeartFilledIcon size={18} /> : <HeartIcon size={18} />}
        </button>
        )}
        <Menu items={items} label={`More options for ${t.title}`} />
      </div>
    </li>
  )
}
