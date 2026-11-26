// 旅程（匯率頁）的輸入驗證與列表整理，純函式。設計見 docs/superpowers/specs/2026-11-26-fx-page-design.md
import { isValidDate } from '../ledger/entryDraft.js'
import { shortDate } from '../ledger/dates.js'

export const TRIP_NAME_MAX = 20

/**
 * 新增或編輯旅程的輸入 → 要寫入的欄位（不含 createdAt）。
 * @returns { ok: true, data } | { ok: false, reason }   reason：name、currency、date、dateOrder
 * 沒填的日期不放進 data（編輯時由資料層移除舊值）。
 */
export const buildTripData = ({ name, currency, startDate, endDate, countInStats }) => {
  const trimmed = String(name ?? '').trim().slice(0, TRIP_NAME_MAX)
  if (!trimmed) return { ok: false, reason: 'name' }
  if (typeof currency !== 'string' || currency.length !== 3) return { ok: false, reason: 'currency' }
  const start = startDate || ''
  const end = endDate || ''
  if ((start && !isValidDate(start)) || (end && !isValidDate(end))) return { ok: false, reason: 'date' }
  if (start && end && end < start) return { ok: false, reason: 'dateOrder' }
  return { ok: true, data: { name: trimmed, currency, countInStats: !!countInStats, ...(start && { startDate: start }), ...(end && { endDate: end }) } }
}

// 建立時間新到舊；剛寫入、時間還沒回填（沒有 createdAt）的排最前
const createdMs = (t) => t.createdAt?.toMillis?.() ?? Infinity
const newestFirst = (a, b) => {
  const d = createdMs(b) - createdMs(a)
  return Number.isNaN(d) ? 0 : d
}

// 列表分成「進行中」與「已封存」；垃圾桶中（有 deletedAt）的旅程不列出
export const splitTrips = (trips) => {
  const live = trips.filter((t) => !t.deletedAt).sort(newestFirst)
  return { active: live.filter((t) => !t.archived), archived: live.filter((t) => t.archived) }
}

// 出發日與回程日顯示成「11/7–11/10」；只有一個日期顯示那一天；都沒有回空字串
export const tripRange = (trip) => {
  const { startDate, endDate } = trip
  if (startDate && endDate) return startDate === endDate ? shortDate(startDate) : `${shortDate(startDate)}–${shortDate(endDate)}`
  const one = startDate || endDate
  return one ? shortDate(one) : ''
}
