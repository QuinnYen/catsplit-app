// 帳目金額的換算。每筆帳目記「實際花的幣別與金額」與當下匯率：
//   baseAmount   = 換成帳本統計幣別（統計只加總它，之後不重算）
//   accountAmount = 對帳戶餘額的影響（帳戶幣別），幣別相同時不需要
import { roundToCurrency } from '../../config/currencies.js'

// 去掉二進位浮點的雜訊（0.1 + 0.2）。金額最多到小數第 6 位，足夠任何貨幣
export const roundMoney = (v) => Math.round(v * 1e6) / 1e6
export const addMoney = (a, b) => roundMoney(a + b)

const positive = (v) => typeof v === 'number' && v > 0

/**
 * 算出一筆收入／支出要存的金額欄位。
 * amount、currency：實際花的金額與幣別；rate：1 currency = rate baseCurrency（幣別相同時忽略）。
 * accountCurrency：帳戶幣別，與 currency 不同時需要 accountRate（1 currency = accountRate accountCurrency）
 * 或直接給 accountAmount（實際扣款金額，覆寫估算，例如刷卡手續費）。
 * 回傳 { amount, exchangeRate, baseAmount, accountAmount?, accountRate? }；缺匯率時丟出錯誤。
 */
export const computeEntryAmounts = ({ amount, currency, baseCurrency, rate, accountCurrency, accountRate, accountAmount }) => {
  const rounded = roundToCurrency(amount, currency)
  if (!positive(rounded)) throw new Error('amount must be positive')

  let exchangeRate = 1
  let baseAmount = rounded
  if (currency !== baseCurrency) {
    if (!positive(rate)) throw new Error('rate to base currency is required')
    exchangeRate = rate
    baseAmount = roundToCurrency(rounded * rate, baseCurrency)
    if (!positive(baseAmount)) throw new Error('base amount rounds to zero')
  }

  const out = { amount: rounded, exchangeRate, baseAmount }
  if (accountCurrency && accountCurrency !== currency) {
    if (positive(accountAmount)) {
      out.accountAmount = roundToCurrency(accountAmount, accountCurrency)
      out.accountRate = positive(accountRate) ? accountRate : out.accountAmount / rounded
    } else {
      if (!positive(accountRate)) throw new Error('rate to account currency is required')
      out.accountAmount = roundToCurrency(rounded * accountRate, accountCurrency)
      out.accountRate = accountRate
    }
    if (!positive(out.accountAmount)) throw new Error('account amount rounds to zero')
  }
  return out
}
