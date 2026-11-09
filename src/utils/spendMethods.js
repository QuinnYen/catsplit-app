// 支出的「付款方式」：內建 'cash'，其餘是使用者自訂的名稱快照（存在 expense.paymentMethod）。
export const CASH = 'cash'

// 舊資料沒有欄位，一律視為現金
export const normalizeSpendMethod = (raw) => raw || CASH

export const spendMethodLabel = (raw, t) => {
  const v = normalizeSpendMethod(raw)
  return v === CASH ? t('payMethod.cash') : v
}

// 依付款方式加總（用換算後的 amount），金額大到小；現金一定會出現
export const sumBySpendMethod = (expenses) => {
  const sums = { [CASH]: 0 }
  expenses.forEach(e => {
    const key = normalizeSpendMethod(e.paymentMethod)
    sums[key] = (sums[key] || 0) + e.amount
  })
  return Object.entries(sums)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
}
