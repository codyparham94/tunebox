import '@fontsource-variable/inter/opsz.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles/app.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { queryClient } from './lib/queries'

const root = createRoot(document.getElementById('root')!)
const mount = (node: ReactNode) =>
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </StrictMode>
  )

// The pop-out equalizer loads only what it needs (no player, no media session).
if (location.hash.startsWith('#/eq-window')) void import('./EqWindow').then(({ EqWindow }) => mount(<EqWindow />))
else void import('./App').then(({ App }) => mount(<App />))
