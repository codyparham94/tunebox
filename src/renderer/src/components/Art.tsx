import { useState } from 'react'
import { MusicIcon } from './Icons'

export function Art({
  src,
  size,
  round,
  className = '',
  alt = ''
}: {
  src?: string
  size?: number | string
  round?: boolean
  className?: string
  alt?: string
}) {
  const [failed, setFailed] = useState(false)
  const style = size !== undefined ? { width: size, height: size } : undefined
  return (
    <div className={`art${round ? ' round' : ''} ${className}`} style={style}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <div className="art-fallback">
          <MusicIcon size={typeof size === 'number' ? Math.max(16, size / 3) : 32} />
        </div>
      )}
    </div>
  )
}
