// 匯率計算機的計算，純函式。設計見 docs/superpowers/specs/2026-11-26-fx-page-design.md 第 5 節。
// rates：以 USD 為 1 的匯率表 { USD: 1, JPY: 156.2, TWD: 32.1, ... }（open.er-api.com 一份表就有全部幣別），
// 任兩種幣別的匯率用「對 USD 的匯率相除」算出來；使用者設的自訂匯率（customRates）優先。
import { CURRENCIES, roundToCurrency } from '../../config/currencies.js'

export const MAX_ROWS = 6

// 設定頁（第五階段）會存到雲端；第四階段先用這份預設值
export const DEFAULT_FX_SETTINGS = {
  decimals: 1, // 換算結果顯示幾位小數
  defaultAmount: 1, // 開啟時輸入列的預設金額
  showSymbol: true,
  taxFreePercent: 10, // 免稅：價格含稅 10%
  cardFeePercent: 1.5, // 刷卡手續費
  customRates: {}, // { 'JPY_TWD': 0.2 }：1 JPY = 0.2 TWD，優先於 API 匯率
}

const known = (code) => typeof code === 'string' && CURRENCIES.some((c) => c.code === code)

// 預設的換算列：旅遊幣別、統計幣別，再補常用的，湊 4 列
export const defaultRows = (tripCurrency, base) =>
  [...new Set([tripCurrency, base, 'USD', 'JPY', 'CNY', 'EUR'].filter(known))].slice(0, 4)

// 從雲端或本機讀回來的換算列：必須是不重複、認得的幣別、1–6 列，否則回 null（呼叫端改用預設）
export const sanitizeRows = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) return null
  if (!rows.every(known) || new Set(rows).size !== rows.length) return null
  return rows
}

export const validCode = (code) => (known(code) ? code : null)

// 1 from = ? to。自訂匯率（'FROM_TO'，或反向 'TO_FROM'）優先；沒有就用匯率表相除；缺資料回 null
export const pairRate = (rates, custom, from, to) => {
  if (from === to) return 1
  const direct = custom?.[`${from}_${to}`]
  if (direct > 0) return direct
  const inverse = custom?.[`${to}_${from}`]
  if (inverse > 0) return 1 / inverse
  const rf = rates?.[from]
  const rt = rates?.[to]
  return rf > 0 && rt > 0 ? rt / rf : null
}

// 把 value（幣別 from）換成每一列的幣別：{ [code]: number | null }（null 是這個幣別沒有匯率）
export const convertRows = ({ value, from, codes, rates, custom }) => {
  const out = {}
  for (const code of codes) {
    const rate = pairRate(rates, custom, from, code)
    out[code] = value == null || rate == null ? null : value * rate
  }
  return out
}

/**
 * 實付計算（依截圖驗算：12,733.7 → 免稅 −1,157.6 → 刷卡 +173.6 → 實付 11,749.8）。
 * 先換成實付幣別，再「先免稅、後刷卡」：
 *   免稅：價格含稅 p% 時扣掉稅金，扣掉的金額 = 金額 − 金額 ÷ (1 + p/100)（標示 −10%，實際是除以 1.1，不是乘 0.9）
 *   刷卡：加在免稅後的金額上，手續費 = 免稅後金額 × f/100
 * amount 是輸入列的金額（幣別 from）。回傳未四捨五入的 { gross, taxDeduct, afterTax, fee, total }，缺匯率或金額回 null。
 */
export const computePay = ({ amount, from, pay, rates, custom, taxFree, taxPercent, card, cardPercent }) => {
  const rate = pairRate(rates, custom, from, pay)
  if (amount == null || rate == null) return null
  const gross = amount * rate
  const taxDeduct = taxFree ? gross - gross / (1 + taxPercent / 100) : 0
  const afterTax = gross - taxDeduct
  const fee = card ? (afterTax * cardPercent) / 100 : 0
  return { gross, taxDeduct, afterTax, fee, total: afterTax + fee }
}

export const roundTo = (value, decimals) => {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

// 顯示用：固定小數位數與千分位；沒有值（缺匯率）顯示「—」
export const formatFixed = (value, decimals) =>
  value == null || !Number.isFinite(value) ? '—' : Number(roundTo(value, decimals)).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

// 記帳時帶進去的金額：實付金額四捨五入到實付幣別的小數位數（日圓整數）
export const recordAmount = (total, payCurrency) => roundToCurrency(total, payCurrency)
