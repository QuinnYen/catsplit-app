import { roundToCurrency } from '../config/currencies.js'

// 由每人餘額（基準幣，正＝該收、負＝該付）算出最少轉帳次數的建議：[{ from, to, amount }]。
// 金額依基準幣的小數位數取整（日圓整數、美元到分），取整後為 0 的殘餘（分帳除不盡）不列成建議
export const computeSettleSuggestions = (balances, baseCurrency) => {
  const creditors = []
  const debtors = []
  Object.entries(balances).forEach(([uid, amt]) => {
    if (amt > 0.01) creditors.push({ uid, amt })
    else if (amt < -0.01) debtors.push({ uid, amt: -amt })
  })
  creditors.sort((a, b) => b.amt - a.amt)
  debtors.sort((a, b) => b.amt - a.amt)

  const result = []
  let i = 0, j = 0
  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i]
    const debtor = debtors[j]
    const amount = Math.min(creditor.amt, debtor.amt)
    const rounded = roundToCurrency(amount, baseCurrency)
    if (rounded > 0) result.push({ from: debtor.uid, to: creditor.uid, amount: rounded })
    creditor.amt -= amount
    debtor.amt -= amount
    if (creditor.amt < 0.01) i++
    if (debtor.amt < 0.01) j++
  }
  return result
}
