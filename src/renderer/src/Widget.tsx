import { useEffect, useState } from 'react'
import type { NowPlaying } from '@shared/types'
import { Art } from './components/Art'
import { NextIcon, PauseIcon, PlayIcon, PopOutIcon, PrevIcon, ThumbDownIcon, ThumbUpIcon } from './components/Icons'
import { api, keys, queryClient, useSettings } from './lib/queries'
import { useTheme } from './lib/themes'

/**
 * The desktop widget: an always-on-top now-playing card. Audio plays in the hidden main window;
 * this window only shows what main forwards and sends commands back.
 */
export function Widget() {
  const settings = useSettings().data
  useTheme(settings?.theme ?? 'system')
  const [np, setNp] = useState<NowPlaying>({ playing: false, inStation: false })

  useEffect(() => {
    document.title = 'Tunebox'
    document.documentElement.dataset.widget = ''
    const off = api.onNowPlaying(setNp)
    // the song already playing when the widget opened (the push for it came before this listener)
    void api.system.currentNowPlaying().then(setNp)
    const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.settings })
    window.addEventListener('focus', refresh)
    return () => {
      off()
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const has = !!np.title
  return (
    <main className="widget" aria-label="Now playing">
      <Art src={np.artUrl} size={60} className="widget-art" />
      <div className="widget-text">
        <div className="widget-title truncate" title={np.title}>
          {np.title ?? 'Nothing playing'}
        </div>
        <div className="widget-artist truncate muted" title={np.artist}>
          {np.artist ?? 'Tunebox'}
        </div>
      </div>
      <div className="widget-controls">
        {np.inStation && (
          <button className="icon-btn widget-thumb" aria-label="Thumbs down (skips)" disabled={!has} onClick={() => void api.system.command('thumbDown')}>
            <ThumbDownIcon size={16} />
          </button>
        )}
        <button className="icon-btn" aria-label="Previous" disabled={!has} onClick={() => void api.system.command('prev')}>
          <PrevIcon size={18} />
        </button>
        <button className="icon-btn play-btn" aria-label={np.playing ? 'Pause' : 'Play'} onClick={() => void api.system.command('playPause')}>
          {np.playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <button className="icon-btn" aria-label="Next" disabled={!has} onClick={() => void api.system.command('next')}>
          <NextIcon size={18} />
        </button>
        {np.inStation && (
          <button className="icon-btn widget-thumb" aria-label="Thumbs up" disabled={!has} onClick={() => void api.system.command('thumbUp')}>
            <ThumbUpIcon size={16} />
          </button>
        )}
      </div>
      <button className="icon-btn widget-expand" aria-label="Back to the full window" title="Back to the full window" onClick={() => void api.system.widget(false)}>
        <PopOutIcon size={16} />
      </button>
    </main>
  )
}
