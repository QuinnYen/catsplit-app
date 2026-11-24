// 本機偏好（localStorage，不同步到帳號）：目前帳本、每個帳本最近用的帳戶與分類。
// storage 由呼叫端傳入（瀏覽器用 localStorage），讀寫失敗（無痕模式、容量滿）一律靜默忽略。
const lastKey = (uid, ledgerId) => `cs-ledger-last:${uid}:${ledgerId}`
const activeKey = (uid) => `cs-ledger-active:${uid}`

const readJson = (storage, key) => {
  try {
    const v = JSON.parse(storage.getItem(key))
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export const readLastUsed = (storage, uid, ledgerId) => readJson(storage, lastKey(uid, ledgerId))

export const writeLastUsed = (storage, uid, ledgerId, patch) => {
  try {
    storage.setItem(lastKey(uid, ledgerId), JSON.stringify({ ...readLastUsed(storage, uid, ledgerId), ...patch }))
  } catch { /* 存不了就不記，不影響記帳 */ }
}

export const readActiveLedgerId = (storage, uid) => {
  try {
    return storage.getItem(activeKey(uid)) || null
  } catch {
    return null
  }
}

export const writeActiveLedgerId = (storage, uid, ledgerId) => {
  try {
    storage.setItem(activeKey(uid), ledgerId)
  } catch { /* 同上 */ }
}

// 目前帳本：存的 id 還在就用它，否則用第一個（已排序）帳本；沒有帳本回 null
export const pickActiveLedgerId = (ledgers, savedId) =>
  ledgers.some((l) => l.id === savedId) ? savedId : (ledgers[0]?.id ?? null)

// 新增帳目的預設帳戶與分類：最近用的還在清單就沿用，否則取第一個（快照帳戶與封存帳戶不能選）
export const pickEntryDefaults = ({ accounts, last = {}, kind, categories }) => {
  const usable = accounts.filter((a) => a.kind !== 'group' && !a.archived)
  const accountId = usable.some((a) => a.id === last.accountId) ? last.accountId : (usable[0]?.id ?? '')
  const lastCategory = kind === 'income' ? last.incomeCategory : last.expenseCategory
  const category = categories.includes(lastCategory) ? lastCategory : (categories[0] ?? '')
  return { accountId, category }
}
