// 匯率計算機的計算，純函式。設計見 docs/superpowers/specs/2026-11-26-fx-page-design.md 第 5 節。
// rates：以 USD 為 1 的匯率表 { USD: 1, JPY: 156.2, TWD: 32.1, ... }（open.er-api.com 一份表就有全部幣別），
// 任兩種幣別的匯率用「對 USD 的匯率相除」算出來；使用者的自訂匯率先用 adjustRates 套進表裡。
import { CURRENCIES, roundToCurrency } from '../../config/currencies.js'

export const MAX_ROWS = 6

// 設定頁（第五階段）會存到雲端；第四階段先用這份預設值
// 預設的換算列（帳號層級的全域設定，不跟旅程或帳本走）
export const DEFAULT_ROWS = ['TWD', 'JPY', 'USD']

export const DEFAULT_FX_SETTINGS = {
  rows: DEFAULT_ROWS, // 換算列的幣別（1–6 個，順序即顯示順序）
  decimals: 1, // 換算結果顯示幾位小數
  defaultAmount: 1, // 開啟時輸入列的預設金額
  showSymbol: true,
  taxFreePercent: 10, // 免稅：價格含稅 10%
  cardFeePercent: 1.5, // 刷卡手續費
  serviceFeePercent: 10, // 服務費（加收，以免稅後的金額為基準）
  addTaxPercent: 8, // 外加稅（價格不含稅時另外加收）
  tipPercent: 15, // 小費
  showShortcuts: { card: true, taxFree: true, service: false, addTax: false, tip: false }, // 內建捷徑要不要出現在計算機的捷徑列（預設只開刷卡和免稅）
  customShortcuts: [], // 自訂捷徑：[{ id, name, percent, kind: 'add' | 'deduct', visible }]，visible 沒寫就是顯示
  customRates: {}, // { 'JPY_TWD': 0.2 }：1 JPY = 0.2 TWD，優先於 API 匯率
}

const known = (code) => typeof code === 'string' && CURRENCIES.some((c) => c.code === code)

// 從雲端或本機讀回來的換算列：必須是不重複、認得的幣別、1–6 列，否則回 null（呼叫端改用預設）
export const sanitizeRows = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) return null
  if (!rows.every(known) || new Set(rows).size !== rows.length) return null
  return rows
}

export const validCode = (code) => (known(code) ? code : null)

/**
 * 自訂匯率（使用者在「幣別」頁設的）：每種幣別對基準幣一筆，鍵 'JPY_TWD' 表示 1 JPY = ? TWD（基準幣是 TWD 的帳本）。
 * 把匯率表調整成使用者的自訂值，這樣任兩種幣別的換算都用同一份，結果一致
 * （例如自訂的 JPY 和市場的 USD 互換，也以自訂的 JPY 為準）。只處理「幣別對基準幣」的項目；
 * 其他組合的舊資料（早期版本可設任意兩種幣別）不再套用，避免畫面上看不到、改不了的匯率偷偷生效。
 * 反向的鍵（'TWD_JPY'）自動取倒數。rates 缺基準幣時原樣回傳。
 */
export const adjustRates = (rates, custom, base) => {
  const out = { ...rates }
  const rb = rates?.[base]
  if (!(rb > 0)) return out
  for (const code of Object.keys(rates)) {
    if (code === base) continue
    const k = customRateOf(custom, code, base)
    if (k) out[code] = rb / k
  }
  return out
}

// 這種幣別有沒有自訂匯率（對基準幣），有就回傳「1 code = ? base」，沒有回 null
export const customRateOf = (custom, code, base) => {
  if (code === base) return null
  const direct = custom?.[`${code}_${base}`]
  if (direct > 0) return direct
  const inverse = custom?.[`${base}_${code}`]
  return inverse > 0 ? 1 / inverse : null
}

// 這兩種幣別之間的換算有沒有用到自訂匯率（畫面上標示「自訂」用）：任何一邊（不是基準幣）有自訂就算
export const usesCustom = (custom, base, from, to) =>
  from !== to && (customRateOf(custom, from, base) != null || customRateOf(custom, to, base) != null)

// 1 from = ? to，用匯率表（以 USD 為 1，或 adjustRates 調整過的）相除；缺資料回 null
export const pairRate = (rates, from, to) => {
  if (from === to) return 1
  const rf = rates?.[from]
  const rt = rates?.[to]
  return rf > 0 && rt > 0 ? rt / rf : null
}

// 把 value（幣別 from）換成每一列的幣別：{ [code]: number | null }（null 是這個幣別沒有匯率）
export const convertRows = ({ value, from, codes, rates }) => {
  const out = {}
  for (const code of codes) {
    const rate = pairRate(rates, from, code)
    out[code] = value == null || rate == null ? null : value * rate
  }
  return out
}

/**
 * 實付計算（依截圖驗算：12,733.7 → 免稅 −1,157.6 → 刷卡 +173.6 → 實付 11,749.8）。
 * 先換成實付幣別，再依序：
 *   免稅：價格含稅 p% 時扣掉稅金，扣掉的金額 = 金額 − 金額 ÷ (1 + p/100)（標示 −10%，實際是除以 1.1，不是乘 0.9）
 *   extras：服務費、外加稅、小費與自訂捷徑，各自以「免稅後的金額」為基準加上或扣掉 percent%（percent 為負是扣除），彼此不疊加
 *   刷卡：加在前面全部加總（subtotal）上，手續費 = subtotal × f/100
 * amount 是輸入列的金額（幣別 from）。回傳未四捨五入的 { gross, taxDeduct, afterTax, lines, subtotal, fee, total }
 * （lines 是 extras 對應的 [{ key, amount }]，扣除為負數），缺匯率或金額回 null。
 */
export const computePay = ({ amount, from, pay, rates, taxFree, taxPercent, card, cardPercent, extras = [] }) => {
  const rate = from === pay ? 1 : pairRate(rates, from, pay)
  if (amount == null || rate == null) return null
  const gross = amount * rate
  const taxDeduct = taxFree ? gross - gross / (1 + taxPercent / 100) : 0
  const afterTax = gross - taxDeduct
  const lines = extras.map(({ key, percent }) => ({ key, amount: (afterTax * percent) / 100 }))
  const subtotal = afterTax + lines.reduce((sum, l) => sum + l.amount, 0)
  const fee = card ? (subtotal * cardPercent) / 100 : 0
  return { gross, taxDeduct, afterTax, lines, subtotal, fee, total: subtotal + fee }
}

// 算式顯示用：每個數字的整數部分加千分位（1000+2500. → 1,000+2,500.），小數部分與運算符號不動
export const formatExpr = (expr) => expr.replace(/(\d+)(\.\d*)?/g, (_, int, frac = '') => int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + frac)

export const roundTo = (value, decimals) => {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

// 顯示用：固定小數位數與千分位；沒有值（缺匯率）顯示「—」
export const formatFixed = (value, decimals) =>
  value == null || !Number.isFinite(value) ? '—' : Number(roundTo(value, decimals)).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

// 記帳時帶進去的金額：實付金額四捨五入到實付幣別的小數位數（日圓整數）
export const recordAmount = (total, payCurrency) => roundToCurrency(total, payCurrency)
