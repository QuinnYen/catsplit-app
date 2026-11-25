// 個人帳本的預算（統計幣別）：只算支出，收入不扣。門檻與群組預算一致（src/utils/budget.js）。
import { WARN_RATIO, OVER_RATIO } from '../../utils/budget.js'

const round2 = (n) => Math.round(n * 100) / 100

// 沒有預算（未設定或不是正數）回傳 null；否則 { amount, spent, remaining, ratio, level: 'ok' | 'warn' | 'over' }
export const budgetStatus = (amount, spent) => {
  if (typeof amount !== 'number' || !(amount > 0)) return null
  const used = round2(spent ?? 0)
  const ratio = used / amount
  return { amount, spent: used, remaining: round2(amount - used), ratio, level: ratio >= OVER_RATIO ? 'over' : ratio >= WARN_RATIO ? 'warn' : 'ok' }
}

// 預算輸入框的文字 → 金額；空白是「取消預算」（null），無效回傳 undefined
export const parseBudgetInput = (text) => {
  const s = String(text ?? '').trim()
  if (s === '') return null
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined
  const v = Math.round(Number(s) * 100) / 100
  return v > 0 && v < 1e12 ? v : undefined
}
