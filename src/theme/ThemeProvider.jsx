import { createContext, useContext, useEffect, useState } from 'react'
import { THEME_STORAGE_KEY, normalizeMode, resolveTheme } from './theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'
const ThemeContext = createContext(null)

const readMode = () => {
  try { return normalizeMode(localStorage.getItem(THEME_STORAGE_KEY)) } catch { return 'system' }
}
const systemPrefersDark = () => window.matchMedia(DARK_QUERY).matches

export const ThemeProvider = ({ children }) => {
  const [mode, setModeState] = useState(readMode)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  const resolved = resolveTheme(mode, systemDark)

  // 系統主題中途切換時即時跟著變（只有 system 模式用得到，但一直監聽成本很低）
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystemDark(mq.matches)
    // iOS 14 以前的 WebKit（含舊版 LINE 內建瀏覽器）沒有 MediaQueryList.addEventListener
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  const setMode = (next) => {
    const m = normalizeMode(next)
    setModeState(m)
    try { localStorage.setItem(THEME_STORAGE_KEY, m) } catch { /* 無痕模式等情況存不了，這次不記住即可 */ }
  }

  return <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
