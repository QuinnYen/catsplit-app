import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import zhTW from './zh-TW'
import en from './en'
import { EN_READY, normalizeLang, pickLanguage, translate } from './core'
import { makeFormat } from './format'

const DICTS = { 'zh-TW': zhTW, en }
const STORAGE_KEY = 'catsplit-lang'

const readStored = () => {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
const writeStored = (lang) => {
  try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* 無痕模式等情況存不了，這次不記住即可 */ }
}

// 測試用：網址帶 ?lang=en 時手動切換語言並記住（分享連結的預覽語言用的是 hl，不是這個參數）
const readInitialChoice = () => {
  const fromUrl = normalizeLang(new URLSearchParams(window.location.search).get('lang'))
  if (fromUrl) {
    writeStored(fromUrl)
    return fromUrl
  }
  return normalizeLang(readStored())
}

const I18nContext = createContext(null)

export const I18nProvider = ({ children }) => {
  const [choice, setChoice] = useState(readInitialChoice)
  const [liffLang, setLiffLang] = useState(null)

  const lang = pickLanguage({ urlLang: choice, liffLang, navLang: navigator.language })

  const setLang = useCallback((next) => {
    writeStored(next)
    setChoice(next)
  }, [])

  const t = useCallback(
    (key, params) => translate(DICTS, lang, key, params, import.meta.env.DEV ? (k) => console.warn(`[i18n] missing key: ${k}`) : undefined),
    [lang],
  )
  const fmt = useMemo(() => makeFormat(lang), [lang])

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant'
    document.title = t('app.title')
  }, [lang, t])

  const value = useMemo(
    () => ({ lang, setLang, t, fmt, enReady: EN_READY, applyAutoLanguage: setLiffLang }),
    [lang, setLang, t, fmt],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useI18n = () => {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
