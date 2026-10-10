// 資料與顯示拆開：分類、付款方式、最新動態在資料裡存的是代碼，顯示時一律經過這裡轉成目前語言。

// 分類：預設分類是代碼，自訂分類存使用者輸入的原字串
export const CATEGORY_CODES = ['food', 'transport', 'lodging', 'shopping', 'entertainment', 'daily', 'other', 'refund', 'advance', 'subsidy']

// 空值 → other；代碼與自訂分類原樣保留
export const normalizeCategory = (raw) => raw || 'other'

export const categoryLabel = (raw, t) => {
  const code = normalizeCategory(raw)
  return CATEGORY_CODES.includes(code) ? t(`category.${code}`) : code
}

// 付款方式
export const PAYMENT_METHOD_CODES = ['cash', 'jkopay', 'richart', 'bank', 'other']

export const normalizePaymentMethod = (raw) => raw || 'cash'

export const paymentMethodLabel = (raw, t) => {
  const code = normalizePaymentMethod(raw)
  return PAYMENT_METHOD_CODES.includes(code) ? t(`payMethod.${code}`) : code
}

// 最新動態（群組文件的 lastActivity）
export const ACTIVITY_TYPES = [
  'expense_added', 'income_added', 'expense_updated', 'income_updated',
  'expense_deleted', 'income_deleted', 'settlement_added', 'settlement_deleted',
]

// 回傳要展開進 lastActivity 的欄位（不含 at、by）。name、toName 缺少時存 null，由顯示端補「某人」
export const activityForWrite = ({ type, title, name, toName }) => (
  { name: name ?? null, type, title: title ?? null, toName: toName ?? null }
)

// 依語言組句；沒有已知 type（沒有動態）時回傳空字串
export const describeActivity = (a, t) => {
  if (a?.type && ACTIVITY_TYPES.includes(a.type)) {
    return t(`activity.${a.type}`, { title: a.title ?? '', toName: a.toName ?? t('common.someone') })
  }
  return ''
}
