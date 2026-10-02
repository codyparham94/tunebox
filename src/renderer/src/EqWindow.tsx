import { useEffect } from 'react'
import { Equalizer } from './components/Equalizer'
import { Toasts } from './components/Toasts'
import { keys, queryClient, useSettings } from './lib/queries'
import { useTheme } from './lib/themes'
import { eq } from './store/eq'

/** The pop-out equalizer window. It only edits EQ settings; audio plays in the main window. */
export function EqWindow() {
  const settings = useSettings().data
  useTheme(settings?.theme ?? 'system')

  useEffect(() => {
    void eq.load()
    document.title = 'Tunebox Equalizer'
    // Pick up theme changes made in the main window.
    const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.settings })
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  return (
    <main className="eq-window">
      <h1 className="section-title" style={{ marginBottom: 'var(--space-4)' }}>
        Equalizer
      </h1>
      <Equalizer popped />
      <Toasts />
    </main>
  )
}
