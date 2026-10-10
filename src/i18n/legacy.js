// 資料與顯示拆開：分類、付款方式、最新動態在資料裡存的是中文（舊）或代碼（新），顯示時一律經過這裡。
// WRITE_CODES 為 true 時新資料寫代碼；舊資料的中文仍由讀取端認得。
// 改回 false 可還原成寫入與舊版逐字相同的中文（讀取端兩種都吃）。
export const WRITE_CODES = true

// 分類
const CATEGORY_LABELS = {
  food: '餐飲', transport: '交通', lodging: '住宿', shopping: '購物', entertainment: '娛樂', daily: '日用品', other: '其他',
  refund: '退款', advance: '預收款', subsidy: '補貼',
}
export const CATEGORY_CODES = Object.keys(CATEGORY_LABELS)
const LEGACY_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_LABELS).map(([code, label]) => [label, code]))

// 空值 → other；舊中文標籤 → 代碼；代碼與自訂分類原樣保留
export const normalizeCategory = (raw) => {
  if (!raw) return 'other'
  if (raw in CATEGORY_LABELS) return raw
  return LEGACY_CATEGORY[raw] ?? raw
}
export const categoryLabel = (raw, t) => {
  const code = normalizeCategory(raw)
  return code in CATEGORY_LABELS ? t(`category.${code}`) : code
}
export const categoryForWrite = (code) => (WRITE_CODES ? code : (CATEGORY_LABELS[code] ?? code))

// 付款方式
const PAYMENT_LABELS = { cash: '現金', jkopay: '街口支付', richart: 'Richart', bank: '銀行轉帳', other: '其他' }
export const PAYMENT_METHOD_CODES = Object.keys(PAYMENT_LABELS)
const LEGACY_PAYMENT = Object.fromEntries(Object.entries(PAYMENT_LABELS).map(([code, label]) => [label, code]))

export const normalizePaymentMethod = (raw) => {
  if (!raw) return 'cash'
  if (raw in PAYMENT_LABELS) return raw
  return LEGACY_PAYMENT[raw] ?? raw
}
export const paymentMethodLabel = (raw, t) => {
  const code = normalizePaymentMethod(raw)
  return code in PAYMENT_LABELS ? t(`payMethod.${code}`) : code
}
export const paymentMethodForWrite = (code) => (WRITE_CODES ? code : (PAYMENT_LABELS[code] ?? code))

// 最新動態（群組文件的 lastActivity）
export const ACTIVITY_TYPES = [
  'expense_added', 'income_added', 'expense_updated', 'income_updated',
  'expense_deleted', 'income_deleted', 'settlement_added', 'settlement_deleted',
]
const LEGACY_SENTENCE = {
  expense_added: ({ title }) => `新增了「${title}」`,
  income_added: ({ title }) => `新增了收入「${title}」`,
  expense_updated: ({ title }) => `修改了「${title}」`,
  income_updated: ({ title }) => `修改了收入「${title}」`,
  expense_deleted: ({ title }) => `刪除了「${title}」`,
  income_deleted: ({ title }) => `刪除了收入「${title}」`,
  settlement_added: ({ toName }) => `轉帳給 ${toName}`,
  settlement_deleted: () => '刪除了一筆轉帳',
}

// 回傳要展開進 lastActivity 的欄位（不含 at、by）。name、toName 缺少時，舊格式補「某人」，新格式存 null 由顯示端補
export const activityForWrite = ({ type, title, name, toName }) => {
  if (WRITE_CODES) return { name: name ?? null, type, title: title ?? null, toName: toName ?? null }
  return { name: name ?? '某人', text: LEGACY_SENTENCE[type]({ title, toName: toName ?? '某人' }) }
}

// 有已知 type 就依語言組句，否則（舊資料）顯示原文 text
export const describeActivity = (a, t) => {
  if (a?.type && ACTIVITY_TYPES.includes(a.type)) {
    return t(`activity.${a.type}`, { title: a.title ?? '', toName: a.toName ?? t('common.someone') })
  }
  return a?.text ?? ''
}
