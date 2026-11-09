// 支出的「付款方式」：內建 'cash'、'credit'，其餘是使用者自訂的名稱快照（存在 expense.paymentMethod）。
export const CASH = 'cash'
export const CREDIT = 'credit'
export const BUILTIN_SPEND_METHODS = [CASH, CREDIT]
const BUILTIN_LABEL_KEY = { [CASH]: 'payMethod.cash', [CREDIT]: 'spend.credit' }

// 舊資料沒有欄位，一律視為現金
export const normalizeSpendMethod = (raw) => raw || CASH

export const spendMethodLabel = (raw, t) => {
  const v = normalizeSpendMethod(raw)
  return BUILTIN_LABEL_KEY[v] ? t(BUILTIN_LABEL_KEY[v]) : v
}

// 自訂名稱不能和內建代碼或其顯示名稱相同，否則統計會混在一起
export const isReservedSpendName = (name, t) =>
  BUILTIN_SPEND_METHODS.some(c => name.toLowerCase() === c || name === t(BUILTIN_LABEL_KEY[c]))

// 依付款方式加總（用換算後的 amount），金額大到小；內建的兩種一定會出現
export const sumBySpendMethod = (expenses) => {
  const sums = { [CASH]: 0, [CREDIT]: 0 }
  expenses.forEach(e => {
    const key = normalizeSpendMethod(e.paymentMethod)
    sums[key] = (sums[key] || 0) + e.amount
  })
  return Object.entries(sums)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
}
