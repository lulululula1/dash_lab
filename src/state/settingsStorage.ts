export type MotionLevel = 'full' | 'reduced' | 'off'

export interface Settings {
  motion: MotionLevel
  decimals: number
  compactNumbers: boolean
  maxCategories: number
}

export const DEFAULT_SETTINGS: Settings = {
  motion: 'full',
  decimals: 1,
  compactNumbers: true,
  maxCategories: 12,
}

/** 설정만 저장한다. 업로드 데이터는 어떤 경우에도 브라우저 저장소에 쓰지 않는다. */
const STORAGE_KEY = 'nexus.settings.v1'

export function loadSaved(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      motion: parsed.motion === 'reduced' || parsed.motion === 'off' ? parsed.motion : 'full',
      decimals: Number.isInteger(parsed.decimals) && parsed.decimals! >= 0 && parsed.decimals! <= 3 ? parsed.decimals! : DEFAULT_SETTINGS.decimals,
      compactNumbers: typeof parsed.compactNumbers === 'boolean' ? parsed.compactNumbers : DEFAULT_SETTINGS.compactNumbers,
      maxCategories: [8, 12, 20, 30].includes(parsed.maxCategories ?? 0) ? parsed.maxCategories! : DEFAULT_SETTINGS.maxCategories,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}

export function clearSavedSettings(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 저장소를 쓸 수 없는 환경 */
  }
}
