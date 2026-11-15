// 依語言格式化數字與日期（zh-TW 的輸出要與原本 toLocale*String('zh-TW') 的結果相同）
import { getCurrency } from '../config/currencies.js'

const LOCALE = { 'zh-TW': 'zh-TW', en: 'en-US' }

export const makeFormat = (lang) => {
  const locale = LOCALE[lang] ?? LOCALE['zh-TW']
  // 金額依該貨幣的小數位數固定位數（美元 12.50、日圓 1,235），不會多出零頭也不會被吃掉分
  const amount = (n, code) => {
    const digits = getCurrency(code).decimals
    return Number(n).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  }
  const date = (d, options) => new Date(d).toLocaleDateString(locale, options)
  const shortDate = (d) => date(d)
  const time = (d) => new Date(d).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  return {
    num: (n) => Number(n).toLocaleString(locale),
    amount,
    money: (n, code) => `${getCurrency(code).symbol} ${amount(n, code)}`,
    date: (d) => date(d, { year: 'numeric', month: 'long', day: 'numeric' }),
    shortDate,
    time,
    dateTimeFull: (d) => new Date(d).toLocaleString(locale),
    dateTime: (d) => `${shortDate(d)} ${time(d)}`,
    month: (d) => date(d, { month: 'long' }),
    yearMonth: (d) => date(d, { year: 'numeric', month: 'long' }),
    // 週日到週六（2026-01-04 是週日）
    weekdays: Array.from({ length: 7 }, (_, i) => date(new Date(2026, 0, 4 + i), { weekday: 'short' })),
  }
}
