// 固定收支與固定轉帳：由規則算出該產生哪些帳目（純函式，不碰 Firestore）。
// 沒有後端排程：開啟帳本時，把規則「已產生到」之後、到今天為止漏掉的項目補上（見 groupSync 之外的 recurringRun.js）。
// 規則的原定日期（scheduled）決定帳目 id（r_{規則id}_{原定日期}），假日調整只改帳目的 date，所以假日資料變動不會讓 id 漂移。
// 幣別一律是帳戶幣別；帳戶幣別與統計幣別不同時，統計匯率用規則上固定的 rate。
import { roundToCurrency } from '../../config/currencies.js'
import { balanceDeltas } from './balance.js'

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly']
export const RECURRING_KINDS = ['expense', 'income', 'transfer']
export const MAX_PER_RUN = 1000 // 每次開啟最多補入幾筆，剩下的下次再補
export const CHUNK = 200 // 一個交易最多幾筆帳目（連同餘額更新，不超過 Firestore 的 500 個操作）
export const HOLIDAY_ADJUST = ['none', 'before', 'after']

const pad = (n) => String(n).padStart(2, '0')
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d) }
const daysIn = (y, m) => new Date(y, m, 0).getDate()
// 每月幾日：0 是月末；超過當月天數取當月最後一天
const dayInMonth = (y, m, day) => (day === 0 ? daysIn(y, m) : Math.min(day, daysIn(y, m)))

/**
 * 規則在 (after, upTo] 之間的原定日期，由早到晚，最多 limit 筆。after 是「已產生到」（不含），null 是從起始日開始。
 * 規則：frequency、startDate、endDate?、dayOfMonth?（每月：1–28 或 0 月末）
 */
export const scheduledDates = (rule, { after = null, upTo, limit = Infinity }) => {
  const last = rule.endDate && rule.endDate < upTo ? rule.endDate : upTo
  const from = after && after >= rule.startDate ? addDays(after, 1) : rule.startDate // 含
  const out = []
  if (from > last) return out
  const push = (d) => { if (d >= from && d <= last && d >= rule.startDate) out.push(d); return out.length >= limit }

  if (rule.frequency === 'daily') {
    for (let d = from; d <= last; d = addDays(d, 1)) if (push(d)) break
  } else if (rule.frequency === 'weekly') {
    const weekday = parse(rule.startDate).getDay()
    let d = from
    while (parse(d).getDay() !== weekday) d = addDays(d, 1)
    for (; d <= last; d = addDays(d, 7)) if (push(d)) break
  } else if (rule.frequency === 'monthly') {
    const day = rule.dayOfMonth ?? Math.min(Number(rule.startDate.slice(8)), 28)
    let [y, m] = from.split('-').map(Number)
    for (;; m += 1) {
      if (m > 12) { m = 1; y += 1 }
      const d = `${y}-${pad(m)}-${pad(dayInMonth(y, m, day))}`
      if (d > last) break
      if (push(d)) break
    }
  } else if (rule.frequency === 'yearly') {
    const month = Number(rule.startDate.slice(5, 7))
    const day = Number(rule.startDate.slice(8))
    for (let y = Number(from.slice(0, 4)); ; y += 1) {
      const d = `${y}-${pad(month)}-${pad(dayInMonth(y, month, day))}`
      if (d > last) break
      if (push(d)) break
    }
  }
  return out
}

// 假日調整：none 不動；before 往前找最近的非假日；after 往後找。isHoliday(dateStr) → boolean。找不到（連假超過 31 天）就維持原日期
export const adjustForHoliday = (date, mode, isHoliday) => {
  if (mode !== 'before' && mode !== 'after') return date
  if (!isHoliday(date)) return date
  const step = mode === 'before' ? -1 : 1
  for (let i = 1; i <= 31; i += 1) {
    const d = addDays(date, step * i)
    if (!isHoliday(d)) return d
  }
  return date
}

// 一筆原定日期對應的帳目資料（不含 createdAt）。account 是規則的帳戶（用它的幣別）
const buildEntry = (rule, scheduled, date, account, ledgerBaseCurrency) => {
  const base = {
    accountId: rule.accountId, amount: rule.amount, currency: account.currency,
    ...(rule.name && { title: rule.name }), ...(rule.note && { note: rule.note }), date,
    source: { type: 'recurring', ruleId: rule.id, scheduled },
  }
  if (rule.kind === 'transfer') return { type: 'transfer', ...base, toAccountId: rule.toAccountId, toAmount: rule.amount }
  const sameAsBase = account.currency === ledgerBaseCurrency
  const exchangeRate = sameAsBase ? 1 : rule.rate
  return {
    type: rule.kind, ...base, ...(rule.category && { category: rule.category }),
    exchangeRate, baseAmount: sameAsBase ? rule.amount : roundToCurrency(rule.amount * rule.rate, ledgerBaseCurrency),
  }
}

/**
 * 算出這次要補入的帳目，依規則分成交易大小的區塊。
 * @param rules             規則 [{ id, ...fields }]；停用的略過
 * @param today             'YYYY-MM-DD'
 * @param accountsById      Map／物件：帳戶 id → { currency, kind }；規則的帳戶找不到時略過這個規則（並推進進度，不會一直重試）
 * @param holidayAdjust     'none' | 'before' | 'after'
 * @param isHoliday         dateStr → boolean（holidayAdjust 為 none 時不會呼叫）
 * @returns { chunks: [{ ruleId, expectedThrough, newThrough, entries: [{ id, data }], deltas }], total, capped }
 *   每個 chunk 要在同一個交易裡：確認規則的 generatedThrough 仍是 expectedThrough、寫入 entries、依 deltas 加減帳戶餘額、把 generatedThrough 改成 newThrough
 */
export const planRecurring = ({ rules, today, ledgerBaseCurrency, accountsById, holidayAdjust = 'none', isHoliday = () => false, cap = MAX_PER_RUN, chunkSize = CHUNK }) => {
  const get = (id) => (accountsById instanceof Map ? accountsById.get(id) : accountsById[id])
  const chunks = []
  let total = 0
  let capped = false
  for (const rule of rules) {
    if (rule.enabled === false) continue
    const after = rule.generatedThrough ?? null
    const room = cap - total
    if (room <= 0) { capped = true; break }
    // 多取一筆，才知道這個規則是不是被上限截斷
    const dates = scheduledDates(rule, { after, upTo: today, limit: room + 1 })
    const take = dates.slice(0, room)
    if (dates.length > room) capped = true
    if (take.length === 0) continue
    const account = get(rule.accountId)
    const toAccount = rule.kind === 'transfer' ? get(rule.toAccountId) : true
    const usable = account && account.kind !== 'group' && toAccount && (rule.kind !== 'transfer' || toAccount.kind !== 'group')
    for (let i = 0; i < take.length; i += chunkSize) {
      const part = take.slice(i, i + chunkSize)
      const expectedThrough = i === 0 ? after : take[i - 1]
      const entries = usable
        ? part.map((scheduled) => ({ id: `r_${rule.id}_${scheduled}`, data: buildEntry(rule, scheduled, adjustForHoliday(scheduled, holidayAdjust, isHoliday), account, ledgerBaseCurrency) }))
        : []
      const deltas = {}
      for (const e of entries) for (const [id, d] of Object.entries(balanceDeltas(e.data))) deltas[id] = Math.round(((deltas[id] ?? 0) + d) * 1e6) / 1e6
      chunks.push({ ruleId: rule.id, expectedThrough, newThrough: part.at(-1), entries, deltas })
    }
    total += usable ? take.length : 0
  }
  return { chunks, total, capped }
}

// 建立規則前預覽：從起始日到今天會補入幾筆（不含假日調整，只是數量）
export const countBackfill = (rule, today, cap = MAX_PER_RUN) => scheduledDates(rule, { after: null, upTo: today, limit: cap + 1 }).length
