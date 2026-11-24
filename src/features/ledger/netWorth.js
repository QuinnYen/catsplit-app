// 淨資產：把各帳戶餘額依匯率換成帳本統計幣別後加總。快照帳戶（群組同步）不計入。
// rates：{ [幣別]: 1 該幣別 = ? 統計幣別 }；沒有匯率的外幣帳戶不計入，並回報在 missing，讓畫面標註「估算不完整」。
import { roundToCurrency } from '../../config/currencies.js'
import { addMoney } from './money.js'

export const netWorthCurrencies = (accounts, baseCurrency) => [
  ...new Set(accounts.filter((a) => a.kind !== 'group' && a.currency !== baseCurrency).map((a) => a.currency)),
]

export const computeNetWorth = ({ accounts, baseCurrency, rates = {} }) => {
  let total = 0
  const missing = new Set()
  let foreign = false
  for (const a of accounts) {
    if (a.kind === 'group') continue
    if (a.currency === baseCurrency) {
      total = addMoney(total, a.balance ?? 0)
      continue
    }
    foreign = true
    const rate = rates[a.currency]
    if (typeof rate === 'number' && rate > 0) total = addMoney(total, (a.balance ?? 0) * rate)
    else missing.add(a.currency)
  }
  return { total: roundToCurrency(total, baseCurrency), estimated: foreign, missing: [...missing] }
}
