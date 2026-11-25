// 帳本主頁的日期輔助：日期一律是本機時間的 'YYYY-MM-DD' 字串
const pad = (n) => String(n).padStart(2, '0')

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayStr = (now = new Date()) => toDateStr(now)
// ---------- 期間（「月」）----------
// 帳本可以設定月開始日 monthStartDay：1–28 是每月幾日，0 是每月最後一天（月末）。
// 期間 'YYYY-MM' 從該月的起始日開始，到下一個期間起始日的前一天為止；以「起始日所在的月份」命名。
// 例：每月 5 日 → '2026-11' 是 11/5–12/4；月末 → '2026-11' 是 11/30–12/30。起始日是 1 時就是日曆月份。
const daysIn = (y, m) => new Date(y, m, 0).getDate()
const startDayOf = (y, m, startDay) => (startDay === 0 ? daysIn(y, m) : startDay)
const keyOf = (y, m) => `${y}-${pad(m)}`
const shiftKey = (monthKey, delta) => {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return keyOf(d.getFullYear(), d.getMonth() + 1)
}

// 期間第一天（'YYYY-MM-DD'）
export const periodStart = (monthKey, startDay = 1) => {
  const [y, m] = monthKey.split('-').map(Number)
  return `${monthKey}-${pad(startDayOf(y, m, startDay))}`
}

// 期間的查詢範圍：date >= start 且 date < end（end 是下一個期間的第一天）
export const periodBounds = (monthKey, startDay = 1) => ({ start: periodStart(monthKey, startDay), end: periodStart(shiftKey(monthKey, 1), startDay) })

// 這一天屬於哪個期間
export const monthKeyOf = (dateStr, startDay = 1) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return d >= startDayOf(y, m, startDay) ? keyOf(y, m) : shiftKey(keyOf(y, m), -1)
}

// 期間的最後一天（含）
export const periodLastDay = (monthKey, startDay = 1) => {
  const [y, m, d] = periodBounds(monthKey, startDay).end.split('-').map(Number)
  return toDateStr(new Date(y, m - 1, d - 1))
}

export const weekdayOf = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

// 切換期間後要選哪一天：回到今天所在的期間就選今天，否則選該期間第一天
export const dateForMonth = (monthKey, today = todayStr(), startDay = 1) => (monthKey === monthKeyOf(today, startDay) ? today : periodStart(monthKey, startDay))
export const shiftMonthDate = (dateStr, delta, today = todayStr(), startDay = 1) => dateForMonth(shiftKey(monthKeyOf(dateStr, startDay), delta), today, startDay)

// ---------- 年度 ----------
// 年期間 'YYYY'：從該年「年開始月」的月期間起點，到 12 個月後（下一年同月）的月期間起點前一天，以起始年命名。
// 例：年開始月 4、月開始日 5 → '2026' 是 2026-04-05 到 2027-04-04。年開始月 1 且月開始日 1 就是日曆年。
export const yearMonths = (yearKey, yearStartMonth = 1) => Array.from({ length: 12 }, (_, i) => shiftKey(`${yearKey}-${pad(yearStartMonth)}`, i))

export const yearBounds = (yearKey, startDay = 1, yearStartMonth = 1) => {
  const first = `${yearKey}-${pad(yearStartMonth)}`
  return { start: periodStart(first, startDay), end: periodStart(shiftKey(first, 12), startDay) }
}

export const yearLastDay = (yearKey, startDay = 1, yearStartMonth = 1) => {
  const [y, m, d] = yearBounds(yearKey, startDay, yearStartMonth).end.split('-').map(Number)
  return toDateStr(new Date(y, m - 1, d - 1))
}

// 這一天屬於哪個年期間
export const yearKeyOf = (dateStr, startDay = 1, yearStartMonth = 1) => {
  const [y, m] = monthKeyOf(dateStr, startDay).split('-').map(Number)
  return String(m >= yearStartMonth ? y : y - 1)
}

// 切換年期間後要選哪一天：回到今天所在的年期間就選今天，否則選該年第一天
export const dateForYear = (yearKey, today = todayStr(), startDay = 1, yearStartMonth = 1) =>
  (yearKey === yearKeyOf(today, startDay, yearStartMonth) ? today : yearBounds(yearKey, startDay, yearStartMonth).start)
export const shiftYearDate = (dateStr, delta, today = todayStr(), startDay = 1, yearStartMonth = 1) =>
  dateForYear(String(Number(yearKeyOf(dateStr, startDay, yearStartMonth)) + delta), today, startDay, yearStartMonth)

// 帳本的期間設定；沒設定的帳本是日曆月份、日曆年、週日開頭
export const periodSettings = (ledger) => ({ monthStartDay: ledger?.monthStartDay ?? 1, weekStartDay: ledger?.weekStartDay ?? 0, yearStartMonth: ledger?.yearStartMonth ?? 1 })

// 'MM/DD'，給當日明細標題用
export const shortDate = (dateStr) => `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}`
