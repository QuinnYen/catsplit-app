import { roundToCurrency } from '../config/currencies.js'

// 餘額狀態：依基準幣的小數位數取整後判斷，和結算建議（computeSettleSuggestions）的取整規則一致。
// 日圓、台幣等沒有小數的幣別，分帳除不盡的尾差（例如 0.4）取整後為 0，視為已結清，
// 否則這種尾差無法再轉帳，首頁會永遠顯示待收款／待付款。
// 回傳 'settled'（已結清）、'receive'（待收款）、'pay'（待付款）
export const getBalanceStatus = (balance, baseCurrency) => {
  const rounded = roundToCurrency(balance ?? 0, baseCurrency || 'TWD')
  if (rounded === 0) return 'settled'
  return rounded > 0 ? 'receive' : 'pay'
}

export const isBalanceSettled = (balance, baseCurrency) => getBalanceStatus(balance, baseCurrency) === 'settled'
