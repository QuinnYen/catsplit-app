// 群組預算（第一版只有整個群組的總預算，period.type = 'trip'）
// 預算與彙總都是群組基準幣；淨額 = 支出 − 收入

export const WARN_RATIO = 0.8
export const OVER_RATIO = 1

const round2 = (n) => Math.round(n * 100) / 100

/**
 * 算出預算使用狀況；沒有預算時回傳 null
 * 期間缺漏當 trip；之後 monthly 由呼叫端傳入該期間的 totals，函式本身不讀帳目
 * totals: { totalAmount, totalIncome }（缺漏當 0）
 * delta：預覽新增的淨額（支出為正、收入為負）；replace：編輯時要扣掉的原帳目淨額
 * spent 先四捨五入到兩位再比較門檻，避免浮點累加誤差
 */
export const computeBudgetStatus = (budget, totals, { delta = 0, replace = 0 } = {}) => {
  const amount = budget?.amount
  if (typeof amount !== 'number' || !(amount > 0)) return null
  const spent = round2((totals?.totalAmount ?? 0) - (totals?.totalIncome ?? 0) - replace + delta)
  const ratio = spent / amount
  return {
    amount,
    spent,
    remaining: round2(amount - spent),
    ratio,
    level: ratio >= OVER_RATIO ? 'over' : ratio >= WARN_RATIO ? 'warn' : 'ok',
    periodType: budget.period?.type ?? 'trip',
  }
}
