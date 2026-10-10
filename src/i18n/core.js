// 語言判定與翻譯的純函式（不依賴瀏覽器或 Vite，方便用 node:test 直接測）

// 字串全部抽完、確認英文版沒問題之前維持 false：自動判定一律是中文，只有手動選擇才會是英文
export const EN_READY = false

// zh 開頭 → 繁體中文；其他非空語言（ja、ko…）→ 英文；空值 → null
export const normalizeLang = (tag) => {
  if (typeof tag !== 'string' || !tag.trim()) return null
  return /^zh/i.test(tag.trim()) ? 'zh-TW' : 'en'
}

// 優先順序：手動選擇（網址參數、儲存值）→（EN_READY 為 false 時固定中文）→ LIFF → 瀏覽器 → 中文
export const pickLanguage = ({ urlLang, stored, liffLang, navLang, enReady = EN_READY } = {}) => {
  const manual = normalizeLang(urlLang) || normalizeLang(stored)
  if (manual) return manual
  if (!enReady) return 'zh-TW'
  return normalizeLang(liffLang) || normalizeLang(navLang) || 'zh-TW'
}

// 缺 key 時先退回 zh-TW，再退回 key 本身；缺 key 時呼叫 onMissing(key)
export const translate = (dicts, lang, key, params, onMissing) => {
  let text = dicts[lang]?.[key]
  if (text === undefined) {
    onMissing?.(key)
    text = dicts['zh-TW']?.[key] ?? key
  }
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? params[name] : m)) : text
}
