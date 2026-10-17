import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadSaved, type MotionLevel, type Settings } from './settingsStorage'

interface SettingsContextValue {
  settings: Settings
  setSettings: (s: Settings) => void
  /** OS 설정과 사용자 설정을 합친 실제 동작 수준 */
  motion: MotionLevel
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSaved)
  const osReduced = useReducedMotionPreference()
  const motion: MotionLevel = settings.motion === 'full' && osReduced ? 'reduced' : settings.motion
  const value = useMemo(() => ({ settings, setSettings, motion }), [settings, motion])
  useEffect(() => {
    document.documentElement.classList.toggle('motion-off', motion === 'off')
  }, [motion])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('SettingsProvider가 필요합니다.')
  return ctx
}
