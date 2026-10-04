import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { toast } from '../store/toast'

/**
 * A destructive button that fires only after being held (mouse, Enter or Space), with a fill
 * sweeping across it as the progress. Replaces a confirm() dialog people learn to click through.
 */
export function HoldButton({
  onConfirm,
  label,
  className,
  children,
  duration = 1500
}: {
  onConfirm: () => void
  /** accessible name, e.g. "Delete Indie radio" */
  label: string
  className: string
  children: ReactNode
  duration?: number
}) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const startedAt = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const start = () => {
    if (timer.current !== undefined) return
    startedAt.current = performance.now()
    setHolding(true)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      setHolding(false)
      onConfirm()
    }, duration)
  }

  const cancel = () => {
    if (timer.current === undefined) return
    window.clearTimeout(timer.current)
    timer.current = undefined
    setHolding(false)
    // a plain click: say how it works rather than silently doing nothing
    if (performance.now() - startedAt.current < 300) toast.info('Hold the button to delete')
  }

  const isHoldKey = (key: string) => key === 'Enter' || key === ' '

  return (
    <button
      type="button"
      className={`${className} hold-btn`}
      aria-label={`${label} (hold to confirm)`}
      title="Hold to delete"
      data-holding={holding || undefined}
      style={{ '--hold-duration': `${duration}ms` } as CSSProperties}
      onPointerDown={(e) => e.button === 0 && start()}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if (!isHoldKey(e.key)) return
        e.preventDefault()
        if (!e.repeat) start()
      }}
      onKeyUp={(e) => isHoldKey(e.key) && cancel()}
      onBlur={cancel}
    >
      <span className="hold-fill" aria-hidden="true" />
      {children}
    </button>
  )
}
