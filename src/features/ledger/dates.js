// 帳本主頁的日期輔助：日期一律是本機時間的 'YYYY-MM-DD' 字串
const pad = (n) => String(n).padStart(2, '0')

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayStr = (now = new Date()) => toDateStr(now)
export const monthKeyOf = (dateStr) => dateStr.slice(0, 7)
export const weekdayOf = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

// 切換月份後要選哪一天：回到今天所在的月份就選今天，否則選該月 1 日
export const shiftMonthDate = (dateStr, delta, today = todayStr()) => {
  const [y, m] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  return key === monthKeyOf(today) ? today : `${key}-01`
}

// 從月份選擇器選了 'YYYY-MM'：同樣的規則
export const dateForMonth = (monthKey, today = todayStr()) => (monthKey === monthKeyOf(today) ? today : `${monthKey}-01`)

// 'MM/DD'，給當日明細標題用
export const shortDate = (dateStr) => `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}`
