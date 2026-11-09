// 資料與顯示拆開：分類、付款方式在資料裡存的是代碼，顯示時一律經過這裡轉成目前語言。

// 分類：預設分類是代碼，自訂分類存使用者輸入的原字串
export const CATEGORY_CODES = ['food', 'transport', 'lodging', 'shopping', 'entertainment', 'daily', 'other', 'refund', 'advance', 'subsidy', 'sponsorship']

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
