import { roundToCurrency } from '../config/currencies.js'

const round2 = (n) => parseFloat(n.toFixed(2))

// 轉帳頁的金額換算。網址只帶基準幣的建議金額與要轉的幣別，匯率由頁面自己抓（不從網址信任）。
//  baseSuggested：結算頁算出的建議金額（基準幣）
//  rateToCurrency：1 基準幣 = ? 轉帳幣別（外幣時需要，還沒抓到傳 null）
//  customAmount：使用者手動輸入的字串；null 代表沒改過，沿用建議金額
// 回傳 { ready, suggested, actual, baseAmount, rate }：
//  suggested／actual 是轉帳幣別的金額，baseAmount 是要記到餘額的基準幣金額，rate 是 1 轉帳幣別 = ? 基準幣
// 金額沒改就直接用精確的基準幣建議值，避免來回換算的誤差
export const computeTransferAmounts = ({ baseSuggested, currency, baseCurrency, rateToCurrency, customAmount }) => {
  const isForeign = currency !== baseCurrency
  if (isForeign && !(rateToCurrency > 0)) return { ready: false, suggested: 0, actual: 0, baseAmount: 0, rate: 0 }

  const suggested = isForeign ? roundToCurrency(baseSuggested * rateToCurrency, currency) : baseSuggested
  const actual = customAmount == null ? suggested : parseFloat(customAmount) || 0
  const rate = isForeign ? 1 / rateToCurrency : 1
  const baseAmount = actual === suggested ? baseSuggested : round2(actual * rate)
  return { ready: true, suggested, actual, baseAmount, rate }
}
