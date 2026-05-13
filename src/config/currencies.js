export const CURRENCIES = [
  { code: 'TWD', symbol: 'NT$', label: '台幣' },
  { code: 'JPY', symbol: '¥',   label: '日圓' },
  { code: 'USD', symbol: '$',   label: '美元' },
  { code: 'EUR', symbol: '€',   label: '歐元' },
  { code: 'CNY', symbol: 'CN¥', label: '人民幣' },
]

export const getCurrency = (code) =>
  CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]

// open.er-api.com: 免費、無需 key、支援 TWD / CNY
// 回傳 1 from = X to
export const fetchExchangeRate = async (from, to) => {
  if (from === to) return 1
  const res = await fetch(`https://open.er-api.com/v6/latest/${from}`)
  if (!res.ok) throw new Error('匯率抓取失敗')
  const data = await res.json()
  const rate = data.rates?.[to]
  if (!rate) throw new Error(`找不到匯率：${to}`)
  return rate
}
