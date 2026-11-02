// 儲蓄目標的純計算：已存金額、進度、剩餘天數

// 存款加總減提款加總，四捨五入到小數 2 位避免浮點誤差
export const sumSaved = (entries) => {
  const total = entries.reduce((sum, e) => sum + (e.type === 'withdraw' ? -e.amount : e.amount), 0)
  return Math.round(total * 100) / 100 || 0 // || 0 避免 -0 顯示成「-0」
}

// 金額須為大於 0、小於 1e12、最多 2 位小數的有限數字（支援的貨幣最多用到小數 2 位）。
// 用誤差容忍比較小數位數，避免 1.15 * 100 = 114.999… 被誤判
export const isValidAmount = (n) =>
  Number.isFinite(n) && n > 0 && n < 1e12 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6

// 進度夾在 0～1；目標不是正數時回傳 0
export const progressRatio = (saved, target) =>
  target > 0 ? Math.min(1, Math.max(0, saved / target)) : 0

// 顯示用的整數百分比（無條件捨去）；先四捨五入到 0.01% 以免 29/100*100 = 28.999… 少算 1%
export const progressPercent = (saved, target) =>
  Math.floor(Math.round(progressRatio(saved, target) * 10000) / 100)

const toUtcDay = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// 目標日期 − 今天的日數（皆為 YYYY-MM-DD）；沒有目標日期回傳 null，已逾期為負數
export const daysLeft = (targetDate, today) =>
  targetDate ? Math.round((toUtcDay(targetDate) - toUtcDay(today)) / 86400000) : null
