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

// 開 App 時的導向：這個分頁／webview 第一次載入、網址剛好是 / 、而且不是 LIFF 帶參數的進入時，回傳預設頁路徑，否則回傳 null。
// 在 main.jsx 於 React 與登入啟動之前呼叫，所以第一個畫面就是目標頁，不會先閃出分帳列表。
// 那時還不知道是不是訪客，所以不處理訪客：訪客到 /ledger、/savings 會被路由規則導回 /。
// 不論有沒有導向，第一次呼叫都會記下「已開過」，之後同分頁的重新整理與點回 / 都不會再導向。
export const launchRedirect = ({ pathname, search }, local = store('localStorage'), session = store('sessionStorage')) => {
  const first = takeLaunch(session)
  if (!first || pathname !== '/' || search.includes('liff.')) return null
  const path = startPath(getStartPage(local), false)
  return path === '/' ? null : path
}
