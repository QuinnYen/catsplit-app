// 帳本主頁、月曆、圖表用的彙總。帳目的 date 是 'YYYY-MM-DD'；統計只加總 baseAmount，轉帳不計入收支。
import { addMoney, roundMoney } from './money.js'

const pad = (n) => String(n).padStart(2, '0')

export const isCounted = (tx) => tx.type === 'income' || tx.type === 'expense'

// 某月份（'YYYY-MM'）的查詢範圍：date >= start 且 date < end（字串比較即可，不需要複合索引）
export const monthDateBounds = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number)
  const next = new Date(y, m, 1)
  return { start: `${y}-${pad(m)}-01`, end: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01` }
}

// 支出、收入、結餘（收入 − 支出）；統計幣別，轉帳不計
export const summarizeEntries = (txs) => {
  let expense = 0
  let income = 0
  for (const tx of txs) {
    if (tx.type === 'expense') expense = addMoney(expense, tx.baseAmount)
    else if (tx.type === 'income') income = addMoney(income, tx.baseAmount)
  }
  return { expense, income, balance: roundMoney(income - expense) }
}

// 月曆標點用：有帳目（含轉帳）的日期
export const datesWithEntries = (txs) => new Set(txs.map((t) => t.date))

// 當日明細：這一天的帳目與小計（保持傳入順序）
export const entriesOfDate = (txs, date) => {
  const items = txs.filter((t) => t.date === date)
  return { items, ...summarizeEntries(items) }
}

// 分類占比：{ category, total, ratio }，由大到小；type 是 'expense' 或 'income'
export const sumByCategory = (txs, type = 'expense') => {
  const totals = new Map()
  for (const tx of txs) {
    if (tx.type !== type) continue
    const key = tx.category || 'other'
    totals.set(key, addMoney(totals.get(key) ?? 0, tx.baseAmount))
  }
  const sum = [...totals.values()].reduce((a, b) => addMoney(a, b), 0)
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total, ratio: sum > 0 ? total / sum : 0 }))
    .sort((a, b) => b.total - a.total)
}
