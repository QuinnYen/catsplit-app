// 支出的「付款方式」：固定五個大類（存在 expense.paymentMethod），
// 使用者清單裡的名稱（例如「國泰 CUBE」）只當備註存在 expense.paymentNote，統計只看大類。
export const SPEND_TYPES = ['cash', 'credit', 'mobile', 'debit', 'emoney', 'transit']
export const CASH = 'cash'
export const DEFAULT_LIST_TYPE = 'credit'

// 舊資料沒有欄位、或不認得的值（不在固定大類內）都視為現金
export const normalizeSpendType = (raw) => (SPEND_TYPES.includes(raw) ? raw : CASH)

export const spendTypeLabel = (raw, t) => t(`spend.type.${normalizeSpendType(raw)}`)

// 群組頁明細列的底色：色票定義在 index.css 的 --cs-spend-{大類}-bg（兩種主題各自調整），從左往右淡出到卡片色
export const spendTypeBg = (raw) => `var(--cs-spend-${normalizeSpendType(raw)}-bg)`
// 明細列左邊線的顏色
export const spendTypeColor = (raw) => `var(--cs-spend-${normalizeSpendType(raw)})`

// 明細顯示：「信用卡・國泰 CUBE」，沒有備註就只有大類
export const spendMethodText = (expense, t) =>
  [spendTypeLabel(expense.paymentMethod, t), expense.paymentNote].filter(Boolean).join('・')

// 依大類加總（用換算後的 amount），只列有金額的，金額大到小
export const sumBySpendMethod = (expenses) => {
  const sums = {}
  expenses.forEach(e => {
    const key = normalizeSpendType(e.paymentMethod)
    sums[key] = (sums[key] || 0) + e.amount
  })
  return Object.entries(sums)
    .map(([name, amount]) => ({ name, amount }))
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}
