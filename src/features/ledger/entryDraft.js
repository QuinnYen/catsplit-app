// 記帳面板的草稿 ↔ 帳目文件。面板只負責收集輸入，這裡負責驗證與換算，結果直接可寫進 transactions。
import { roundToCurrency } from '../../config/currencies.js'
import { computeEntryAmounts } from './money.js'
import { CATEGORY_MAX, NOTE_MAX } from './constants.js'

// 'YYYY-MM-DD' 且是真的日期（2026-02-30 不行）
export const isValidDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const findAccount = (accounts, id) => accounts.find((a) => a.id === id && a.kind !== 'group')

/**
 * @param draft {
 *   kind: 'expense' | 'income' | 'transfer', amount: number（已由算式算好）, date: 'YYYY-MM-DD', note?: string,
 *   accountId, currency?（實際花的幣別，預設帳戶幣別）, category?,
 *   baseRate?（1 currency = ? 統計幣別）, accountRate?（1 currency = ? 帳戶幣別）, accountAmount?（實際扣款金額，覆寫估算）,
 *   toAccountId?, toAmount?, transferRate?（轉帳跨幣別：1 轉出幣別 = ? 轉入幣別）, sourceType?: 'manual' | 'fx'
 * }
 * @returns { ok: true, data } | { ok: false, reason }
 *   reason：amount、date、account、sameAccount、category、baseRate、accountRate、transferRate
 *   data 不含 createdAt（由資料層加）
 */
export const buildTransactionData = ({ draft, accounts, ledgerBaseCurrency }) => {
  const kind = draft.kind
  if (!isValidDate(draft.date)) return { ok: false, reason: 'date' }
  const account = findAccount(accounts, draft.accountId)
  if (!account) return { ok: false, reason: 'account' }
  const amount = num(draft.amount)
  if (!amount) return { ok: false, reason: 'amount' }
  const note = String(draft.note ?? '').trim().slice(0, NOTE_MAX)
  const source = { type: draft.sourceType === 'fx' ? 'fx' : 'manual' }

  if (kind === 'transfer') {
    const to = findAccount(accounts, draft.toAccountId)
    if (!to) return { ok: false, reason: 'account' }
    if (to.id === account.id) return { ok: false, reason: 'sameAccount' }
    const rounded = roundToCurrency(amount, account.currency)
    if (!(rounded > 0)) return { ok: false, reason: 'amount' }
    let toAmount
    if (to.currency === account.currency) toAmount = rounded
    else if (num(draft.toAmount)) toAmount = roundToCurrency(num(draft.toAmount), to.currency)
    else if (num(draft.transferRate)) toAmount = roundToCurrency(rounded * num(draft.transferRate), to.currency)
    else return { ok: false, reason: 'transferRate' }
    if (!(toAmount > 0)) return { ok: false, reason: 'amount' }
    return {
      ok: true,
      data: { type: 'transfer', accountId: account.id, toAccountId: to.id, amount: rounded, currency: account.currency, toAmount, ...(note && { note }), date: draft.date, source },
    }
  }

  if (kind !== 'expense' && kind !== 'income') return { ok: false, reason: 'amount' }
  const category = String(draft.category ?? '').trim().slice(0, CATEGORY_MAX)
  if (!category) return { ok: false, reason: 'category' }
  const currency = draft.currency || account.currency
  let amounts
  try {
    amounts = computeEntryAmounts({
      amount, currency, baseCurrency: ledgerBaseCurrency, rate: num(draft.baseRate),
      accountCurrency: account.currency, accountRate: num(draft.accountRate), accountAmount: num(draft.accountAmount),
    })
  } catch (e) {
    if (/rate to base/.test(e.message)) return { ok: false, reason: 'baseRate' }
    if (/rate to account/.test(e.message)) return { ok: false, reason: 'accountRate' }
    return { ok: false, reason: 'amount' }
  }
  return {
    ok: true,
    data: { type: kind, accountId: account.id, currency, ...amounts, category, ...(note && { note }), date: draft.date, source },
  }
}

// 編輯既有帳目：還原成面板的草稿欄位（金額以字串放進算式）
export const draftFromTransaction = (tx) => ({
  kind: tx.type,
  expr: String(tx.amount),
  currency: tx.currency,
  accountId: tx.accountId,
  toAccountId: tx.toAccountId ?? '',
  category: tx.category ?? '',
  note: tx.note ?? '',
  date: tx.date,
  accountAmount: tx.accountAmount != null ? String(tx.accountAmount) : '',
  toAmount: tx.toAmount != null ? String(tx.toAmount) : '',
  sourceType: tx.source?.type === 'fx' ? 'fx' : 'manual',
})

// 帳目要顯示的標題：群組同步來的有 title；手動帳目沒有標題，先用備註，再用分類（呼叫端轉成目前語言）
export const entryHeadline = (tx, categoryLabel) => tx.title || tx.note || categoryLabel(tx.category)
