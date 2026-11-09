// 群組頁依月份載入明細用的工具。月份以 'YYYY-MM' 表示，邊界用本機時間（與記帳時 new Date(expenseDate) 一致）。
export const toMonthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const parse = (key) => { const [y, m] = key.split('-').map(Number); return { y, m } }

// 該月的 [start, end)：start 為 1 日 0 點，end 為下個月 1 日 0 點
export const monthRange = (key) => {
  const { y, m } = parse(key)
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) }
}

export const shiftMonth = (key, delta) => {
  const { y, m } = parse(key)
  return toMonthKey(new Date(y, m - 1 + delta, 1))
}

// 最近有帳的月份：傳入各筆帳的時間（毫秒），沒有任何帳就用 now 所在的月份
export const latestMonthKey = (millisList, nowMs) =>
  toMonthKey(new Date(millisList.length ? Math.max(...millisList) : nowMs))

// 已載入明細的小計：支出筆數與金額、收入金額（贊助不算收入）
export const summarizeLoaded = (expenses, incomes) => ({
  count: expenses.length,
  expenseTotal: expenses.reduce((s, e) => s + e.amount, 0),
  incomeTotal: incomes.filter(i => !i.isSponsorship).reduce((s, i) => s + i.amount, 0),
})
