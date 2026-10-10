// 依語言格式化數字與日期（zh-TW 的輸出要與原本 toLocale*String('zh-TW') 的結果相同）
const LOCALE = { 'zh-TW': 'zh-TW', en: 'en-US' }

export const makeFormat = (lang) => {
  const locale = LOCALE[lang] ?? LOCALE['zh-TW']
  const date = (d, options) => new Date(d).toLocaleDateString(locale, options)
  const shortDate = (d) => date(d)
  const time = (d) => new Date(d).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  return {
    num: (n) => Number(n).toLocaleString(locale),
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
