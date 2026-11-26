// 匯率換算頁的個人設定（users/{uid}/settings/fx）：輸入驗證與合併預設值，純函式。
// 文件裡每個欄位都是選填，缺少或壞掉的欄位一律退回預設值（DEFAULT_FX_SETTINGS）。
import { DEFAULT_FX_SETTINGS, roundTo } from './fxMath.js'

export const MAX_CUSTOM_RATES = 20
const RATE_KEY = /^[A-Z]{3}_[A-Z]{3}$/

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const inRange = (v, min, max) => isNum(v) && v >= min && v <= max

/**
 * 設定頁一個欄位的輸入 → 要存的值。raw 可以是輸入框的字串。
 * @returns { ok: true, value } | { ok: false, reason }   reason：number（小數位數）、amount（預設金額）、percent（百分比）
 */
export const parseSetting = (field, raw) => {
  if (field === 'showSymbol') return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false, reason: 'number' }
  const text = String(raw ?? '').trim()
  // 預設金額可以留空（= 0，打開時不預填）；其他欄位不行
  const n = text === '' && field === 'defaultAmount' ? 0 : Number(text)
  if (text === '' && field !== 'defaultAmount') return { ok: false, reason: field === 'decimals' ? 'number' : 'percent' }
  if (field === 'decimals') return Number.isInteger(n) && inRange(n, 0, 3) ? { ok: true, value: n } : { ok: false, reason: 'number' }
  if (field === 'defaultAmount') return isNum(n) && n >= 0 && n < 1e9 ? { ok: true, value: roundTo(n, 8) } : { ok: false, reason: 'amount' }
  if (field === 'taxFreePercent' || field === 'cardFeePercent') return inRange(n, 0, 100) ? { ok: true, value: roundTo(n, 2) } : { ok: false, reason: 'percent' }
  return { ok: false, reason: 'number' }
}

// 自訂匯率：{ 'JPY_TWD': 0.2 }，鍵是「FROM_TO」、值是正數；壞的項目略過，最多 20 組
const cleanCustomRates = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const entries = Object.entries(v).filter(([k, r]) => RATE_KEY.test(k) && k.slice(0, 3) !== k.slice(4) && isNum(r) && r > 0)
  return Object.fromEntries(entries.slice(0, MAX_CUSTOM_RATES))
}

// 把雲端讀到的設定文件（可能是 {}）合併預設值，每個欄位都驗證過
export const mergeFxSettings = (stored) => {
  const s = stored && typeof stored === 'object' ? stored : {}
  const pick = (field) => {
    if (s[field] === undefined) return DEFAULT_FX_SETTINGS[field]
    const r = parseSetting(field, s[field])
    return r.ok && typeof s[field] === (field === 'showSymbol' ? 'boolean' : 'number') ? r.value : DEFAULT_FX_SETTINGS[field]
  }
  return {
    decimals: pick('decimals'),
    defaultAmount: pick('defaultAmount'),
    showSymbol: pick('showSymbol'),
    taxFreePercent: pick('taxFreePercent'),
    cardFeePercent: pick('cardFeePercent'),
    customRates: cleanCustomRates(s.customRates),
  }
}
