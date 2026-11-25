// 「預設開啟頁面」：開 App 時（這個分頁／webview 的第一次進入 /）要導向哪個功能。只存在這台裝置（localStorage）。
// 值：home 入口頁、ledger 記帳（預設）、split 分帳、goals 目標、fx 匯率。訪客沒有記帳與目標，退回分帳。
const KEY = 'cs-start-page'
const LAUNCHED_KEY = 'cs-launched'

export const START_PAGES = [
  { id: 'home', path: '/home', label: 'tab.home' },
  { id: 'ledger', path: '/ledger', label: 'tab.ledger', needsAccount: true },
  { id: 'split', path: '/', label: 'tab.split' },
  { id: 'goals', path: '/savings', label: 'tab.goals', needsAccount: true },
  { id: 'fx', path: '/fx', label: 'tab.fx' },
]
export const DEFAULT_START_PAGE = 'ledger'

const store = (kind) => {
  try { return globalThis[kind] ?? null } catch { return null }
}

export const getStartPage = (storage = store('localStorage')) => {
  try {
    const v = storage?.getItem(KEY)
    return START_PAGES.some((p) => p.id === v) ? v : DEFAULT_START_PAGE
  } catch { return DEFAULT_START_PAGE }
}

export const setStartPage = (id, storage = store('localStorage')) => {
  if (!START_PAGES.some((p) => p.id === id)) return
  try { storage?.setItem(KEY, id) } catch { /* 無痕模式等：存不了就算了，下次用預設 */ }
}

// 偏好對應的路徑；訪客用不到的功能退回分帳列表
export const startPath = (id, guest) => {
  const page = START_PAGES.find((p) => p.id === id) ?? START_PAGES.find((p) => p.id === DEFAULT_START_PAGE)
  return guest && page.needsAccount ? '/' : page.path
}

// 這次開啟 App 是否還沒導向過：第一次問回傳 true 並記下，之後回傳 false（同一個分頁重新整理也不再導向）
export const takeLaunch = (storage = store('sessionStorage')) => {
  try {
    if (storage?.getItem(LAUNCHED_KEY)) return false
    storage?.setItem(LAUNCHED_KEY, '1')
    return true
  } catch { return false }
}
