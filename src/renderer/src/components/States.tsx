import type { ReactNode } from 'react'
import { errorMessage } from '../lib/queries'

export function Loading({ label = 'Loading…', rows = 0 }: { label?: string; rows?: number }) {
  if (rows > 0) {
    return (
      <div role="status" aria-label={label} className="grid gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 52 }} />
        ))}
      </div>
    )
  }
  return (
    <div className="state" role="status">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <span>{children}</span>
      {action}
    </div>
  )
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <span>{errorMessage(error)}</span>
      {retry && (
        <button className="btn btn-sm" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  )
}

/** Renders loading / error / empty / content for a query. */
export function QueryView<T>({
  query,
  empty,
  isEmpty,
  rows,
  children
}: {
  query: { data?: T; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }
  empty?: ReactNode
  isEmpty?: (d: T) => boolean
  rows?: number
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <Loading rows={rows} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const data = query.data as T
  if (empty !== undefined && isEmpty?.(data)) return <Empty>{empty}</Empty>
  return <>{children(data)}</>
}
