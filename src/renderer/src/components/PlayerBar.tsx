import { setLiked } from '../lib/actions'
import { formatTime } from '../lib/format'
import { useSwapIn } from '../lib/motion'
import { modKey } from '../lib/platform'
import { useTrackNav } from '../lib/nav'
import { api, useLikedIds } from '../lib/queries'
import { currentTrack, player, usePlayer, usePlayerState } from '../store/player'
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
  SlidersIcon,
  ShuffleIcon,
  ThumbDownIcon,
  ThumbUpIcon,
  VolumeIcon
} from './Icons'

export function PlayerBar() {
  const s = usePlayerState()
  const t = currentTrack(s)
  const nav = useTrackNav()
  const liked = useLikedIds().data
  const { queueOpen, toggleQueue } = useUi()
  const isLiked = !!t?.id && !!liked?.has(t.id)
  const thumb = t?.id ? s.thumbs[t.id] : undefined
  const duration = s.duration || t?.duration || 0
  const repeatLabel = { off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' }[s.repeat]
  const trackKey = t?.qid ?? 0
  const swapTrack = useSwapIn(trackKey) ? ' swap-in' : ''
  const playState = s.loading && !s.playing ? 'loading' : s.playing ? 'pause' : 'play'
  const swapIcon = useSwapIn(playState) ? ' icon-swap' : ''

  return (
    <footer className="player" aria-label="Player">
      <div className="player-track">
        <Art key={`art-${trackKey}`} src={t?.artUrl} size={56} className={swapTrack} />
        <div key={`text-${trackKey}`} className={`min-w-0${swapTrack}`}>
          {t ? (
            <>
              <div className="truncate">
                <button className="link-btn title-link" title={`${t.title}: go to album`} onClick={() => void nav.album(t)}>
                  {t.title}
                </button>
              </div>
              <div className="track-meta truncate">
                <button className="link-btn" title={`Go to ${t.artist}`} onClick={() => void nav.artist(t)}>
                  {t.artist}
                </button>
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
          <button className="icon-btn" aria-label="Previous" title={`Previous (${modKey}+←)`} onClick={player.prev} disabled={!t}>
            <PrevIcon />
          </button>
          <button
            className="icon-btn play-btn"
            aria-label={s.playing ? 'Pause' : 'Play'}
            title={`${s.playing ? 'Pause' : 'Play'} (Space)`}
            onClick={player.toggle}
            disabled={!t && s.queue.length === 0}
          >
            <span key={playState} className={`icon-slot${swapIcon}`}>
              {playState === 'loading' ? <span className="spinner" style={{ borderTopColor: 'var(--surface)' }} /> : playState === 'pause' ? <PauseIcon /> : <PlayIcon />}
            </span>
          </button>
          <button className="icon-btn" aria-label="Next" title={`Next (${modKey}+→)`} onClick={player.next} disabled={!t}>
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
        <Seek duration={duration} disabled={!t} />
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
        <button className="icon-btn" aria-label="Equalizer" title="Equalizer" onClick={() => void api.eq.popout()}>
          <SlidersIcon size={18} />
        </button>
        <button className="icon-btn" aria-label="Queue" aria-pressed={queueOpen} onClick={toggleQueue}>
          <QueueIcon size={18} />
        </button>
      </div>
    </footer>
  )
}

/** The only part of the bar that follows the playback position, so only it re-renders with it. */
function Seek({ duration, disabled }: { duration: number; disabled: boolean }) {
  const position = usePlayer((s) => s.position)
  return (
    <div className="player-seek">
      <span className="mono text-right">{formatTime(position)}</span>
      <input
        type="range"
        className="range"
        min={0}
        max={Math.max(1, duration)}
        step={1}
        value={Math.min(position, duration)}
        onChange={(e) => player.seek(Number(e.target.value))}
        aria-label="Seek"
        aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
        disabled={disabled}
      />
      <span className="mono">{formatTime(duration)}</span>
    </div>
  )
}
