// 旅程（匯率頁）的輸入驗證與列表整理，純函式。設計見 docs/superpowers/archive/2026-11-26-fx-page-design.md
export const TRIP_NAME_MAX = 20

const validCode = (code) => typeof code === 'string' && code.length === 3

// 預算（選填）：大於 0、小於 10 億的數字，最多兩位小數；空字串代表不設預算
const parseBudget = (raw) => {
  const text = String(raw ?? '').trim()
  if (text === '') return { ok: true, value: null }
  const n = Number(text.replace(/,/g, ''))
  if (!Number.isFinite(n) || !(n > 0) || n >= 1e9) return { ok: false }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

/**
 * 新增或編輯旅程的輸入 → 要寫入的欄位（不含 createdAt）。
 * currency 是旅行地貨幣、homeCurrency 是母國貨幣（兩者不能相同，預算與總花費都以母國貨幣顯示）、budget 選填（母國貨幣）。
 * @returns { ok: true, data } | { ok: false, reason }   reason：name、currency、homeCurrency、sameCurrency、budget
 * 沒填預算就不放進 data（編輯時由資料層移除舊值）。
 */
export const buildTripData = ({ name, currency, homeCurrency, budget, countInStats }) => {
  const trimmed = String(name ?? '').trim().slice(0, TRIP_NAME_MAX)
  if (!trimmed) return { ok: false, reason: 'name' }
  if (!validCode(currency)) return { ok: false, reason: 'currency' }
  if (!validCode(homeCurrency)) return { ok: false, reason: 'homeCurrency' }
  if (currency === homeCurrency) return { ok: false, reason: 'sameCurrency' }
  const b = parseBudget(budget)
  if (!b.ok) return { ok: false, reason: 'budget' }
  return { ok: true, data: { name: trimmed, currency, homeCurrency, countInStats: !!countInStats, ...(b.value != null && { budget: b.value }) } }
}

// 旅程的母國貨幣：沒存（舊旅程）就是帳本的統計幣別
export const tripHome = (trip, base) => (validCode(trip?.homeCurrency) ? trip.homeCurrency : base)

// 建立時間新到舊；剛寫入、時間還沒回填（沒有 createdAt）的排最前
const createdMs = (t) => t.createdAt?.toMillis?.() ?? Infinity
const newestFirst = (a, b) => {
  const d = createdMs(b) - createdMs(a)
  return Number.isNaN(d) ? 0 : d
}

// 列表用：垃圾桶中（有 deletedAt）的旅程不列出，新到舊
export const liveTrips = (trips) => trips.filter((t) => !t.deletedAt).sort(newestFirst)
