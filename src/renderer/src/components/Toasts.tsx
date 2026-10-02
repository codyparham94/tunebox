import { useToasts } from '../store/toast'
import { CloseIcon } from './Icons'

export function Toasts() {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="toasts" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
          <span>{t.message}</span>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
