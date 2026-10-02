import { useNavigate } from 'react-router'
import { setLiked } from '../lib/actions'
import { formatTime } from '../lib/format'
import { useLikedIds } from '../lib/queries'
import { currentTrack, player, usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { Art } from './Art'
import {
  CloseIcon,
  HeartFilledIcon,
  HeartIcon,
  InfoIcon,
  MuteIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  QueueIcon,
  RadioIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  ThumbDownIcon,
  ThumbUpIcon,
  VolumeIcon
} from './Icons'

export function PlayerBar() {
  const s = usePlayer()
  const t = currentTrack(s)
  const navigate = useNavigate()
  const liked = useLikedIds().data
  const { queueOpen, toggleQueue } = useUi()
  const isLiked = !!t?.id && !!liked?.has(t.id)
  const thumb = t?.id ? s.thumbs[t.id] : undefined
  const duration = s.duration || t?.duration || 0
  const repeatLabel = { off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' }[s.repeat]

  return (
    <footer className="player" aria-label="Player">
      <div className="player-track">
        <Art src={t?.artUrl} size={56} />
        <div className="min-w-0">
          {t ? (
            <>
              <div className="track-title truncate" title={t.title}>
                {t.title}
              </div>
              <div className="track-meta truncate">
                {t.artistId ? (
                  <button className="link-btn" onClick={() => navigate(`/artist/${t.artistId}`)}>
                    {t.artist}
                  </button>
                ) : (
                  <span className="muted">{t.artist}</span>
                )}
              </div>
              {s.station && t.reason && (
                <div className="reason truncate" title={`Why this song? ${t.reason}`}>
                  <InfoIcon size={12} />
                  <span className="truncate">{t.reason}</span>
                </div>
              )}
            </>
          ) : (
            <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              {s.loading ? 'Tuning in…' : 'Nothing playing'}
            </div>
          )}
        </div>
        {t && (
          <button
            className="icon-btn"
            aria-pressed={isLiked}
            aria-label={isLiked ? 'Remove from liked songs' : 'Add to liked songs'}
            onClick={() => void setLiked(t, !isLiked)}
          >
            {isLiked ? <HeartFilledIcon size={18} /> : <HeartIcon size={18} />}
          </button>
        )}
      </div>

      <div className="player-center">
        <div className="player-controls">
          <button
            className="icon-btn"
            aria-label="Thumbs down (skips)"
            title="Thumbs down: skip and play less like this"
            aria-pressed={thumb === -1}
            disabled={!t}
            onClick={() => player.thumb(-1)}
          >
            <ThumbDownIcon size={18} />
          </button>
          <button
            className="icon-btn"
            aria-label="Shuffle"
            aria-pressed={s.shuffle}
            disabled={!!s.station}
            onClick={player.toggleShuffle}
          >
            <ShuffleIcon size={18} />
          </button>
          <button className="icon-btn" aria-label="Previous" title="Previous (Ctrl+←)" onClick={player.prev} disabled={!t}>
            <PrevIcon />
          </button>
          <button
            className="icon-btn play-btn"
            aria-label={s.playing ? 'Pause' : 'Play'}
            title={`${s.playing ? 'Pause' : 'Play'} (Space)`}
            onClick={player.toggle}
            disabled={!t && s.queue.length === 0}
          >
            {s.loading && !s.playing ? <span className="spinner" style={{ borderTopColor: 'var(--surface)' }} /> : s.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="icon-btn" aria-label="Next" title="Next (Ctrl+→)" onClick={player.next} disabled={!t}>
            <NextIcon />
          </button>
          <button
            className="icon-btn"
            aria-label={repeatLabel}
            title={repeatLabel}
            aria-pressed={s.repeat !== 'off'}
            disabled={!!s.station}
            onClick={player.cycleRepeat}
          >
            {s.repeat === 'one' ? <RepeatOneIcon size={18} /> : <RepeatIcon size={18} />}
          </button>
          <button
            className="icon-btn"
            aria-label="Thumbs up"
            title="Thumbs up: more like this"
            aria-pressed={thumb === 1}
            disabled={!t}
            onClick={() => player.thumb(1)}
          >
            <ThumbUpIcon size={18} />
          </button>
        </div>
        <div className="player-seek">
          <span className="mono text-right">{formatTime(s.position)}</span>
          <input
            type="range"
            className="range"
            min={0}
            max={Math.max(1, duration)}
            step={1}
            value={Math.min(s.position, duration)}
            onChange={(e) => player.seek(Number(e.target.value))}
            aria-label="Seek"
            aria-valuetext={`${formatTime(s.position)} of ${formatTime(duration)}`}
            disabled={!t}
          />
          <span className="mono">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-right">
        {s.station && (
          <span className="station-badge" title={`Playing ${s.station.name}`}>
            <RadioIcon size={14} />
            <span className="truncate" style={{ maxWidth: 120 }}>
              {s.station.name}
            </span>
            <button className="icon-btn" style={{ width: 20, height: 20, color: 'inherit' }} aria-label="Leave station" onClick={player.leaveStation}>
              <CloseIcon size={12} />
            </button>
          </span>
        )}
        <button className="icon-btn" aria-label={s.muted ? 'Unmute' : 'Mute'} onClick={player.toggleMute}>
          {s.muted || s.volume === 0 ? <MuteIcon size={18} /> : <VolumeIcon size={18} />}
        </button>
        <input
          type="range"
          className="range volume"
          min={0}
          max={1}
          step={0.01}
          value={s.muted ? 0 : s.volume}
          onChange={(e) => player.setVolume(Number(e.target.value))}
          aria-label="Volume"
          aria-valuetext={`${Math.round((s.muted ? 0 : s.volume) * 100)}%`}
        />
        <button className="icon-btn" aria-label="Queue" aria-pressed={queueOpen} onClick={toggleQueue}>
          <QueueIcon size={18} />
        </button>
      </div>
    </footer>
  )
}
