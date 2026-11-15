// 支援的貨幣（匯率來源 open.er-api.com 皆有資料）。
// symbol：畫面上金額前面的符號，和別的貨幣撞號的加前綴或直接用代碼（日圓 ¥、人民幣 CN¥）。
// decimals：實務上慣用的小數位數（日圓、韓元、越南盾、印尼盾沒有小數），用來決定金額四捨五入到哪一位。
// 名稱不放字典，用 currencyName() 依語言由瀏覽器產生。順序即「全部貨幣」清單的順序。
export const CURRENCIES = [
  { code: 'TWD', symbol: 'NT$', decimals: 0 },
  { code: 'JPY', symbol: '¥', decimals: 0 },
  { code: 'USD', symbol: '$', decimals: 2 },
  { code: 'EUR', symbol: '€', decimals: 2 },
  { code: 'CNY', symbol: 'CN¥', decimals: 2 },
  { code: 'HKD', symbol: 'HK$', decimals: 2 },
  { code: 'KRW', symbol: '₩', decimals: 0 },
  { code: 'GBP', symbol: '£', decimals: 2 },
  { code: 'AUD', symbol: 'A$', decimals: 2 },
  { code: 'CAD', symbol: 'C$', decimals: 2 },
  { code: 'SGD', symbol: 'S$', decimals: 2 },
  { code: 'THB', symbol: '฿', decimals: 2 },
  { code: 'VND', symbol: '₫', decimals: 0 },
  { code: 'MYR', symbol: 'RM', decimals: 2 },
  { code: 'PHP', symbol: '₱', decimals: 2 },
  { code: 'IDR', symbol: 'Rp', decimals: 0 },
  { code: 'INR', symbol: '₹', decimals: 2 },
  { code: 'NZD', symbol: 'NZ$', decimals: 2 },
  { code: 'CHF', symbol: 'CHF', decimals: 2 },
  { code: 'MOP', symbol: 'MOP$', decimals: 2 },
  { code: 'SEK', symbol: 'SEK', decimals: 2 },
  { code: 'NOK', symbol: 'NOK', decimals: 2 },
  { code: 'DKK', symbol: 'DKK', decimals: 2 },
  { code: 'TRY', symbol: '₺', decimals: 2 },
  { code: 'AED', symbol: 'AED', decimals: 2 },
  { code: 'PLN', symbol: 'zł', decimals: 2 },
  { code: 'CZK', symbol: 'Kč', decimals: 2 },
  { code: 'MXN', symbol: 'MX$', decimals: 2 },
  { code: 'BRL', symbol: 'R$', decimals: 2 },
]

// 選貨幣清單最前面的「常用」（再加上使用者最近選過的）
export const PINNED_CURRENCIES = ['TWD', 'JPY', 'USD', 'EUR']

// 找不到的代碼（舊資料、外部帶入）退回第一個，和原本行為一致
export const getCurrency = (code) =>
  CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]

// 貨幣名稱（中文「日圓」、英文「Japanese Yen」），依語言由瀏覽器產生；不支援時退回代碼
const nameFormatters = {}
export const currencyName = (code, lang) => {
  const locale = lang === 'en' ? 'en' : 'zh-Hant'
  try {
    nameFormatters[locale] ??= new Intl.DisplayNames([locale], { type: 'currency' })
    return nameFormatters[locale].of(code) || code
  } catch {
    return code
  }
}

// 金額四捨五入到該貨幣慣用的小數位數
export const roundToCurrency = (amount, code) => {
  const f = 10 ** getCurrency(code).decimals
  return Math.round(amount * f) / f
}

// 匯率顯示用：保留 4 位有效數字（0.0012 不會被截成 0.0012 以下、40.61 也不會多餘小數）
export const formatRate = (rate) => parseFloat(Number(rate).toPrecision(4))

// open.er-api.com: 免費、無需 key
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
