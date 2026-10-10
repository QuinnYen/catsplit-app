export const CURRENCIES = [
  { code: 'TWD', symbol: 'NT$', labelKey: 'currency.TWD' },
  { code: 'JPY', symbol: '¥',   labelKey: 'currency.JPY' },
  { code: 'USD', symbol: '$',   labelKey: 'currency.USD' },
  { code: 'EUR', symbol: '€',   labelKey: 'currency.EUR' },
  { code: 'CNY', symbol: 'CN¥', labelKey: 'currency.CNY' },
]

export const getCurrency = (code) =>
  CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]

// open.er-api.com: 免費、無需 key、支援 TWD / CNY
// 回傳 1 from = X to
export const fetchExchangeRate = async (from, to) => {
  if (from === to) return 1
  const res = await fetch(`https://open.er-api.com/v6/latest/${from}`)
  if (!res.ok) throw new Error('Failed to fetch exchange rate')
  const data = await res.json()
  const rate = data.rates?.[to]
  if (!rate) throw new Error(`Exchange rate not found: ${to}`)
  return rate
}
