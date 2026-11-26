// 旅程明細頁用的彙總，純函式。金額一律以帳目的 baseAmount（帳本統計幣別）為準；轉帳不是花費，不計入。
import { addMoney, roundMoney } from '../ledger/money.js'

const createdMs = (tx) => tx.createdAt?.toMillis?.() ?? Infinity

/**
 * 旅程的總花費 = 支出 − 收入（退稅等）。
 * base：統計幣別；own：旅遊幣別（只加總幣別等於旅程幣別的帳目的原幣金額，支出加、收入減）；count：全部帳目筆數（含轉帳）。
 */
export const tripTotals = (txs, trip) => {
  let base = 0
  let own = 0
  for (const tx of txs) {
    if (tx.type !== 'expense' && tx.type !== 'income') continue
    const sign = tx.type === 'expense' ? 1 : -1
    base = addMoney(base, sign * tx.baseAmount)
    if (tx.currency === trip.currency) own = addMoney(own, sign * tx.amount)
  }
  return { base: roundMoney(base), own: roundMoney(own), count: txs.length }
}

/**
 * 依日期分組，新到舊；同一天依建立時間新到舊（剛寫入的排最前）。
 * 每組：{ date, net（當日支出 − 收入，統計幣別）, items }
 */
export const groupByDate = (txs) => {
  const groups = new Map()
  for (const tx of txs) {
    if (!groups.has(tx.date)) groups.set(tx.date, [])
    groups.get(tx.date).push(tx)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => {
      const sorted = [...items].sort((a, b) => {
        const d = createdMs(b) - createdMs(a)
        return Number.isNaN(d) ? 0 : d
      })
      return { date, net: tripTotals(sorted, { currency: '' }).base, items: sorted }
    })
}
