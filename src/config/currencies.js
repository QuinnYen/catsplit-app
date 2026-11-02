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
// 同一種來源幣別的整份匯率表在記憶體快取 1 小時；失敗不快取，下次會重試
const RATE_CACHE_MS = 60 * 60 * 1000
const rateCache = new Map() // from -> { at, promise }
const fetchRates = (from) => {
  const hit = rateCache.get(from)
  if (hit && Date.now() - hit.at < RATE_CACHE_MS) return hit.promise
  const promise = fetch(`https://open.er-api.com/v6/latest/${from}`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch exchange rate')
      return res.json()
    })
    .catch(err => {
      rateCache.delete(from)
      throw err
    })
  rateCache.set(from, { at: Date.now(), promise })
  return promise
}

export const fetchExchangeRate = async (from, to) => {
  if (from === to) return 1
  const data = await fetchRates(from)
  const rate = data.rates?.[to]
  if (!rate) throw new Error(`Exchange rate not found: ${to}`)
  return rate
}
