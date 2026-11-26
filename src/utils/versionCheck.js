// 版本檢查：單頁應用只在第一次載入時抓程式碼，PWA 或一直開著的分頁會停在舊版。
// 做法：背景請求 /（index.html，不快取），比對裡面入口 JS 的檔名（檔名帶雜湊，每次建置都不同）和目前載入的是否一樣。
const ENTRY_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/

// 從 HTML 文字找入口 JS 的路徑；找不到回傳 null
export const entryScriptOf = (html) => html?.match(ENTRY_RE)?.[0] ?? null

// 目前載入的入口 JS 路徑；開發模式（沒有雜湊檔名）回傳 null，代表不做檢查
export const currentEntryScript = (doc = globalThis.document) =>
  [...(doc?.scripts ?? [])].map((s) => s.src?.match(ENTRY_RE)?.[0]).find(Boolean) ?? null

// 有新版回傳新的入口路徑，沒有新版、拿不到資料或失敗都回傳 null（失敗不打擾使用者）
export const findNewVersion = async (current, fetchFn = globalThis.fetch) => {
  if (!current) return null
  try {
    const res = await fetchFn('/', { cache: 'no-store' })
    if (!res.ok) return null
    const latest = entryScriptOf(await res.text())
    return latest && latest !== current ? latest : null
  } catch {
    return null
  }
}
