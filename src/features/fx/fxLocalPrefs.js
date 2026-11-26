// 匯率頁只存本機的偏好（localStorage，不同步）：每個帳本目前選的旅程；沒選旅程（或訪客）時的換算列與實付幣別。
// storage 由呼叫端傳入（瀏覽器用 localStorage），讀寫失敗（無痕模式、容量滿）一律靜默忽略。
const tripKey = (uid, ledgerId) => `cs-fx-trip:${uid}:${ledgerId}`
const calcKey = (uid) => `cs-fx-calc:${uid}`

export const readCurrentTripId = (storage, uid, ledgerId) => {
  try {
    return storage.getItem(tripKey(uid, ledgerId)) || null
  } catch {
    return null
  }
}

// tripId 是 null 代表「不選旅程」
export const writeCurrentTripId = (storage, uid, ledgerId, tripId) => {
  try {
    if (tripId) storage.setItem(tripKey(uid, ledgerId), tripId)
    else storage.removeItem(tripKey(uid, ledgerId))
  } catch { /* 存不了就不記 */ }
}

// { rows?, pay? }；壞掉的內容回 {}
export const readLocalCalc = (storage, uid) => {
  try {
    const v = JSON.parse(storage.getItem(calcKey(uid)))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export const writeLocalCalc = (storage, uid, patch) => {
  try {
    storage.setItem(calcKey(uid), JSON.stringify({ ...readLocalCalc(storage, uid), ...patch }))
  } catch { /* 同上 */ }
}
