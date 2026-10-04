import { useEffect, useRef } from 'react'
import type { MotionSetting } from '@shared/types'

/**
 * Applies Settings → Motion as <html data-motion="full|reduced">. CSS keys every reduced-motion
 * rule off that attribute, so "Always" can override a Windows setting that turns animations off.
 */
export function useMotion(setting: MotionSetting): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      const reduced = setting === 'reduced' || (setting === 'system' && media.matches)
      document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [setting])
}

export const motionReduced = (): boolean => document.documentElement.dataset.motion === 'reduced'

/**
 * False until `key` first differs from its value at mount. Pair with `key={key}` on the element
 * so it remounts on each change and its @starting-style entrance plays — but not when the view
 * itself first appears (opening Home shouldn't replay the current song's entrance).
 */
export function useSwapIn(key: unknown): boolean {
  const initial = useRef(key)
  return initial.current !== key
}
