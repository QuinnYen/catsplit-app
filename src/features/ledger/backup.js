// 帳本備份與還原（純函式）。備份是單一帳本的 JSON 檔：帳本設定、帳戶、帳目、類別、固定項目規則；
// 不含群組同步的快照帳戶與快照帳目、群組連結（還原後重新連結群組就會同步回來）。已匯入成一般帳目的群組帳目有備份。
// 還原只能還原成「新帳本」，不動現有帳本；餘額依期初餘額與帳目重新計算，不信任檔案裡的 balance。
import { isSnapshotTx } from './source.js'
import { computeBalance } from './balance.js'
import { isValidDate } from './entryDraft.js'
import { LEDGER_NAME_MAX, ACCOUNT_NAME_MAX, TX_TYPES } from './constants.js'
import { CATEGORY_NAME_MAX, categoryDocId } from './categories.js'
import { FREQUENCIES, RECURRING_KINDS } from './recurring.js'

export const BACKUP_FORMAT = 'catsplit-ledger-backup'
export const BACKUP_VERSION = 1
export const LIMITS = { accounts: 100, categories: 120, recurring: 300, transactions: 40000, bytes: 20 * 1024 * 1024 }

const LEDGER_FIELDS = ['name', 'baseCurrency', 'icon', 'color', 'monthStartDay', 'weekStartDay', 'yearStartMonth', 'monthBudget', 'yearBudget', 'holidayAdjust']
const ACCOUNT_FIELDS = ['name', 'type', 'currency', 'initialBalance', 'balance', 'archived']
const TX_FIELDS = ['type', 'accountId', 'amount', 'currency', 'exchangeRate', 'baseAmount', 'accountAmount', 'accountRate', 'toAccountId', 'toAmount', 'title', 'category', 'note', 'date', 'source']
const CATEGORY_FIELDS = ['kind', 'key', 'name', 'order', 'budget']
const RULE_FIELDS = ['kind', 'name', 'accountId', 'toAccountId', 'amount', 'category', 'note', 'frequency', 'startDate', 'endDate', 'dayOfMonth', 'rate', 'enabled', 'generatedThrough']

// Firestore Timestamp、Date、毫秒數 → 毫秒
const ms = (v) => (typeof v?.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === 'number' ? v : null)
const pick = (obj, fields) => Object.fromEntries(fields.filter((k) => obj[k] !== undefined && obj[k] !== null).map((k) => [k, obj[k]]))
const withMeta = (doc, fields) => ({ id: doc.id, ...pick(doc, fields), createdAt: ms(doc.createdAt) })

// 組備份。快照帳戶（kind: 'group'）與快照帳目（isSnapshotTx）不備份
export const buildBackup = ({ ledger, accounts, transactions, categories, recurring, now = Date.now() }) => {
  const normal = accounts.filter((a) => a.kind !== 'group')
  const txs = transactions.filter((t) => !isSnapshotTx(t))
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    ledger: withMeta(ledger, LEDGER_FIELDS),
    accounts: normal.map((a) => withMeta(a, ACCOUNT_FIELDS)),
    categories: categories.map((c) => ({ id: c.id, ...pick(c, CATEGORY_FIELDS) })),
    recurring: recurring.map((r) => withMeta(r, RULE_FIELDS)),
    transactions: txs.map((t) => withMeta(t, TX_FIELDS)),
  }
}

const ID_RE = /^[A-Za-z0-9_-]{1,120}$/
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isPositive = (v) => isNum(v) && v > 0 && v < 1e12
const isCode = (v) => typeof v === 'string' && v.length === 3

/**
 * 驗證檔案內容（已 JSON.parse）。回傳 { ok: true, backup, summary } 或 { ok: false, reason, detail? }
 * reason：format、version、ledger、limit、account、category、recurring、transaction、reference、duplicate
 * 只做結構與關聯檢查（欄位型別、引用的帳戶存在、id 不重複、數量上限）；細部的金額與字數規則由 Firestore rules 在寫入時再把關。
 */
export const parseBackup = (json) => {
  if (!json || typeof json !== 'object' || json.format !== BACKUP_FORMAT) return { ok: false, reason: 'format' }
  if (!Number.isInteger(json.version) || json.version < 1 || json.version > BACKUP_VERSION) return { ok: false, reason: 'version', detail: json.version }
  const { ledger, accounts, categories, recurring, transactions } = json
  if (!ledger || typeof ledger.name !== 'string' || !ledger.name.trim() || ledger.name.length > LEDGER_NAME_MAX || !isCode(ledger.baseCurrency)) return { ok: false, reason: 'ledger' }
  if (![accounts, categories, recurring, transactions].every(Array.isArray)) return { ok: false, reason: 'format' }
  if (accounts.length > LIMITS.accounts || categories.length > LIMITS.categories || recurring.length > LIMITS.recurring || transactions.length > LIMITS.transactions) return { ok: false, reason: 'limit' }
  if (accounts.length === 0) return { ok: false, reason: 'account', detail: 'none' }

  const accountIds = new Set()
  for (const a of accounts) {
    if (!ID_RE.test(a?.id ?? '') || a.id.startsWith('snap_') || accountIds.has(a.id)) return { ok: false, reason: accountIds.has(a?.id) ? 'duplicate' : 'account', detail: a?.id }
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > ACCOUNT_NAME_MAX || !isCode(a.currency) || !isNum(a.initialBalance ?? 0)) return { ok: false, reason: 'account', detail: a.id }
    accountIds.add(a.id)
  }
  const categoryIds = new Set()
  for (const c of categories) {
    if (!c || !['expense', 'income'].includes(c.kind) || typeof c.key !== 'string' || !c.key || c.key.length > 30 || !Number.isInteger(c.order) || c.id !== categoryDocId(c.kind, c.key)) return { ok: false, reason: 'category', detail: c?.id }
    if (c.name !== undefined && (typeof c.name !== 'string' || !c.name.trim() || c.name.length > CATEGORY_NAME_MAX)) return { ok: false, reason: 'category', detail: c.id }
    if (categoryIds.has(c.id)) return { ok: false, reason: 'duplicate', detail: c.id }
    categoryIds.add(c.id)
  }
  const ruleIds = new Set()
  for (const r of recurring) {
    if (!ID_RE.test(r?.id ?? '') || ruleIds.has(r.id)) return { ok: false, reason: ruleIds.has(r?.id) ? 'duplicate' : 'recurring', detail: r?.id }
    if (!RECURRING_KINDS.includes(r.kind) || !FREQUENCIES.includes(r.frequency) || !isPositive(r.amount) || !isValidDate(r.startDate)) return { ok: false, reason: 'recurring', detail: r.id }
    if (!accountIds.has(r.accountId) || (r.kind === 'transfer' && !accountIds.has(r.toAccountId))) return { ok: false, reason: 'reference', detail: r.id }
    ruleIds.add(r.id)
  }
  const txIds = new Set()
  let minDate = null
  let maxDate = null
  for (const t of transactions) {
    if (!ID_RE.test(t?.id ?? '') || txIds.has(t.id)) return { ok: false, reason: txIds.has(t?.id) ? 'duplicate' : 'transaction', detail: t?.id }
    if (!TX_TYPES.includes(t.type) || !isPositive(t.amount) || !isCode(t.currency) || !isValidDate(t.date) || typeof t.source !== 'object' || !t.source) return { ok: false, reason: 'transaction', detail: t.id }
    if (t.type === 'transfer' ? !(accountIds.has(t.toAccountId) && isPositive(t.toAmount)) : !(isPositive(t.baseAmount) && isPositive(t.exchangeRate))) return { ok: false, reason: 'transaction', detail: t.id }
    if (!accountIds.has(t.accountId)) return { ok: false, reason: 'reference', detail: t.id }
    if (t.source.type === 'group' && t.source.detached !== true) return { ok: false, reason: 'transaction', detail: t.id } // 快照帳目不備份
    txIds.add(t.id)
    if (minDate === null || t.date < minDate) minDate = t.date
    if (maxDate === null || t.date > maxDate) maxDate = t.date
  }
  return {
    ok: true,
    backup: json,
    summary: { name: ledger.name, baseCurrency: ledger.baseCurrency, accounts: accounts.length, transactions: transactions.length, categories: categories.length, recurring: recurring.length, minDate, maxDate, exportedAt: json.exportedAt ?? null },
  }
}

/**
 * 還原計畫：要寫哪些文件，順序是類別、帳戶、固定項目、帳目，**帳本文件最後**（中途失敗時還沒有帳本文件，清掉已寫的部分即可）。
 * 帳戶餘額依期初餘額與帳目重新計算。createdAt 是毫秒（寫入時轉成 Timestamp）。
 * @returns { ledger: { data }, ops: [{ collection: 'categories' | 'accounts' | 'recurring' | 'transactions', id, data }] }
 */
export const planRestore = (backup, { name } = {}) => {
  const ledgerData = { ...pick(backup.ledger, LEDGER_FIELDS), createdAt: backup.ledger.createdAt ?? backup.exportedAt ?? null }
  if (name) ledgerData.name = name.slice(0, LEDGER_NAME_MAX)
  const withCreated = (d, fields) => ({ ...pick(d, fields), ...(d.createdAt != null && { createdAt: d.createdAt }) })
  const txs = backup.transactions.map((t) => ({ id: t.id, ...withCreated(t, TX_FIELDS) }))
  const accounts = backup.accounts.map((a) => {
    const base = { id: a.id, ...withCreated(a, ACCOUNT_FIELDS), kind: 'normal', initialBalance: a.initialBalance ?? 0 }
    return { ...base, balance: computeBalance(base, txs) }
  })
  const ops = [
    ...backup.categories.map((c) => ({ collection: 'categories', id: c.id, data: pick(c, CATEGORY_FIELDS) })),
    ...accounts.map(({ id, ...data }) => ({ collection: 'accounts', id, data })),
    ...backup.recurring.map((r) => ({ collection: 'recurring', id: r.id, data: withCreated(r, RULE_FIELDS) })),
    ...txs.map(({ id, ...data }) => ({ collection: 'transactions', id, data })),
  ]
  return { ledger: { data: ledgerData }, ops }
}

// 備份檔名：帳本名稱＋備份日期
export const backupFileName = (ledger, now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${ledger.name}_backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`
}
