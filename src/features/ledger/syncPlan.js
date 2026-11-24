// 群組 → 個人帳本的同步計畫（純函式，不碰 Firestore）。
// 把「連結之後、我的分攤」變成快照帳戶裡的帳目；呼叫端依回傳的 upserts／deletes 寫入。
// 規則見 spec 第 2 節：分攤口徑、固定 id、消費時間（createdAt）在 linkedAt 之後、贊助不帶、已匯入的不再碰。
import { roundToCurrency } from '../../config/currencies.js'
import { snapshotAccountId, syncedTxId } from './paths.js'
import { isSnapshotTx } from './source.js'
import { CATEGORY_MAX, INCOME_CATEGORIES, NOTE_MAX, TITLE_MAX } from './constants.js'
import { addMoney } from './money.js'

const pad = (n) => String(n).padStart(2, '0')

// Firestore Timestamp、Date、毫秒數都收
export const toMillis = (v) => {
  if (v == null) return null
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v instanceof Date) return v.getTime()
  return typeof v === 'number' ? v : null
}

// 毫秒 → 'YYYY-MM-DD'（本機時間，與群組頁依月份載入的邊界一致）
export const toDateString = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 群組收入的分類（refund、advance、subsidy、other 或自訂文字）對不上個人收入分類的歸「其他」
export const mapIncomeCategory = (c) => (INCOME_CATEGORIES.includes(c) ? c : 'other')
const mapExpenseCategory = (c) => String(c ?? '').slice(0, CATEGORY_MAX) || 'other'

const FIELDS = ['type', 'accountId', 'amount', 'currency', 'exchangeRate', 'baseAmount', 'title', 'category', 'note', 'date']
const sameRow = (a, b) => FIELDS.every((k) => a[k] === b[k]) && JSON.stringify(a.source) === JSON.stringify(b.source)

/**
 * 算出一筆群組帳目對應的個人帳目；不該產生時回傳 null，需要匯率才能算時回傳 { pending: true }。
 * - amount、currency：該筆帳目原幣下我的份額（originalAmount × splits[uid] ÷ amount）
 * - baseAmount：splits[uid]（群組基準幣）換成帳本統計幣別：同幣別直接用；帳目的 homeCurrency 剛好是統計幣別就用 homeRate；
 *   否則用 groupToLedgerRate（首次同步當下的匯率）。已同步且份額沒變的帳目沿用原本的匯率與金額（凍結）。
 */
const buildRow = ({ kind, item, uid, groupId, groupBaseCurrency, ledgerBaseCurrency, groupToLedgerRate, existing }) => {
  if (kind === 'income' && item.isSponsorship) return null
  const share = item.splits?.[uid]
  const total = item.amount
  if (!(share > 0) || !(total > 0)) return null
  const createdMs = toMillis(item.createdAt)
  if (createdMs == null) return null

  const currency = item.currency || groupBaseCurrency
  const original = item.originalAmount ?? total
  const amount = roundToCurrency((original * share) / total, currency)
  if (!(amount > 0)) return null

  let exchangeRate
  let baseAmount
  const frozen = existing && existing.currency === currency && existing.amount === amount && existing.baseAmount > 0 && existing.exchangeRate > 0
  if (frozen) {
    exchangeRate = existing.exchangeRate
    baseAmount = existing.baseAmount
  } else {
    if (groupBaseCurrency === ledgerBaseCurrency) baseAmount = roundToCurrency(share, ledgerBaseCurrency)
    else if (item.homeCurrency === ledgerBaseCurrency && item.homeRate > 0) baseAmount = roundToCurrency(share * item.homeRate, ledgerBaseCurrency)
    else if (groupToLedgerRate > 0) baseAmount = roundToCurrency(share * groupToLedgerRate, ledgerBaseCurrency)
    else return { pending: true }
    if (!(baseAmount > 0)) return null
    exchangeRate = Math.round((baseAmount / amount) * 1e10) / 1e10
  }

  const edited = existing?.source?.edited
  const category = edited?.category && existing ? existing.category : (kind === 'income' ? mapIncomeCategory(item.category) : mapExpenseCategory(item.category))
  const note = edited?.note && existing ? existing.note : String(item.note ?? '').slice(0, NOTE_MAX)
  return {
    type: kind === 'income' ? 'income' : 'expense',
    accountId: snapshotAccountId(groupId),
    amount,
    currency,
    exchangeRate,
    baseAmount,
    title: String(item.title ?? '').slice(0, TITLE_MAX),
    category,
    note,
    date: toDateString(createdMs),
    source: { type: 'group', groupId, kind, itemId: item.id, ...(edited && { edited }) },
  }
}

/**
 * @param uid              本人
 * @param groupId          要同步的群組
 * @param linkedAt         連結時間（Timestamp／Date／毫秒）；只同步消費時間在它之後的帳目
 * @param groupBaseCurrency、ledgerBaseCurrency  群組基準幣、帳本統計幣別
 * @param groupToLedgerRate 1 群組基準幣 = ? 統計幣別（兩者不同、且帳目沒有可用的 homeRate 時才需要）
 * @param expenses、incomes 群組帳目 [{ id, ...fields }]（呼叫端已查詢 createdAt >= linkedAt 也沒關係，這裡會再篩一次）
 * @param existing         帳本內現有的帳目 [{ id, ...fields }]
 * @param now              新帳目的 createdAt（呼叫端傳 serverTimestamp()）
 * @returns { upserts: [{ id, data }], deletes: [id], snapshot: { count, net }, pending: [id] }
 *   pending 是需要匯率才能算的帳目 id；呼叫端取得匯率後重新計畫。pending 的既有帳目不會被刪除。
 */
export const planGroupSync = ({ uid, groupId, linkedAt, groupBaseCurrency, ledgerBaseCurrency, groupToLedgerRate, expenses = [], incomes = [], existing = [], now }) => {
  const linkedMs = toMillis(linkedAt)
  const mine = existing.filter((t) => t.source?.type === 'group' && t.source.groupId === groupId)
  const detachedIds = new Set(mine.filter((t) => !isSnapshotTx(t)).map((t) => t.id))
  const snapshotById = new Map(mine.filter(isSnapshotTx).map((t) => [t.id, t]))

  const upserts = []
  const keep = new Set()
  const pending = []
  const finalRows = []

  const handle = (kind, item) => {
    const id = syncedTxId(groupId, kind, item.id)
    const createdMs = toMillis(item.createdAt)
    if (createdMs == null || createdMs < linkedMs) return
    if (detachedIds.has(id)) return // 已匯入成一般帳目，不再同步
    const old = snapshotById.get(id)
    const row = buildRow({ kind, item, uid, groupId, groupBaseCurrency, ledgerBaseCurrency, groupToLedgerRate, existing: old })
    if (!row) return
    if (row.pending) {
      pending.push(id)
      keep.add(id)
      if (old) finalRows.push(old)
      return
    }
    keep.add(id)
    if (!old) {
      upserts.push({ id, data: { ...row, createdAt: now } })
      finalRows.push(row)
    } else if (!sameRow(old, row)) {
      upserts.push({ id, data: { ...row, createdAt: old.createdAt } })
      finalRows.push(row)
    } else finalRows.push(old)
  }

  for (const e of expenses) handle('expense', e)
  for (const i of incomes) handle('income', i)

  // 快照裡有、這次沒產生的：來源已刪除，或消費日期被改到連結之前
  const deletes = [...snapshotById.keys()].filter((id) => !keep.has(id))

  let net = 0
  for (const r of finalRows) net = addMoney(net, r.type === 'income' ? r.baseAmount : -r.baseAmount)
  return { upserts, deletes, snapshot: { count: finalRows.length, net }, pending }
}
