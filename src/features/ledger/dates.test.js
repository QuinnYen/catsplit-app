import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toDateStr, todayStr, monthKeyOf, weekdayOf, shiftMonthDate, dateForMonth, shortDate, periodStart, periodBounds, periodLastDay, periodSettings } from './dates.js'

test('toDateStr／todayStr 用本機日期並補零', () => {
  assert.equal(toDateStr(new Date(2026, 0, 5)), '2026-01-05')
  assert.equal(todayStr(new Date(2026, 10, 24, 23, 59)), '2026-11-24')
})

test('monthKeyOf／weekdayOf／shortDate', () => {
  assert.equal(monthKeyOf('2026-11-24'), '2026-11')
  assert.equal(weekdayOf('2026-11-24'), 2) // 週二
  assert.equal(weekdayOf('2026-11-01'), 0) // 週日
  assert.equal(shortDate('2026-11-04'), '11/4')
  assert.equal(shortDate('2026-01-31'), '1/31')
})

test('切換月份：回到今天所在的月份選今天，其他月份選 1 日，跨年也對', () => {
  const today = '2026-11-24'
  assert.equal(shiftMonthDate('2026-11-24', -1, today), '2026-10-01')
  assert.equal(shiftMonthDate('2026-10-01', 1, today), '2026-11-24')
  assert.equal(shiftMonthDate('2026-12-15', 1, today), '2027-01-01')
  assert.equal(shiftMonthDate('2026-01-10', -1, today), '2025-12-01')
  assert.equal(shiftMonthDate('2026-03-31', -1, today), '2026-02-01') // 沒有 2/31 也不會跳到 3 月
})

test('選月份：同樣的規則', () => {
  assert.equal(dateForMonth('2026-11', '2026-11-24'), '2026-11-24')
  assert.equal(dateForMonth('2026-09', '2026-11-24'), '2026-09-01')
})

test('期間：起始日是 1 時就是日曆月份（與原行為一致）', () => {
  assert.equal(periodStart('2026-11', 1), '2026-11-01')
  assert.deepEqual(periodBounds('2026-12', 1), { start: '2026-12-01', end: '2027-01-01' })
  assert.equal(periodLastDay('2026-11', 1), '2026-11-30')
  assert.equal(monthKeyOf('2026-11-24', 1), '2026-11')
})

test('期間：每月 5 日，以起始日所在的月份命名', () => {
  assert.deepEqual(periodBounds('2026-11', 5), { start: '2026-11-05', end: '2026-12-05' })
  assert.equal(periodLastDay('2026-11', 5), '2026-12-04')
  assert.equal(monthKeyOf('2026-11-04', 5), '2026-10') // 起始日前一天屬於上一期
  assert.equal(monthKeyOf('2026-11-05', 5), '2026-11')
  assert.equal(monthKeyOf('2026-12-04', 5), '2026-11')
  assert.equal(monthKeyOf('2026-12-05', 5), '2026-12')
  assert.equal(monthKeyOf('2026-01-03', 5), '2025-12') // 跨年
  assert.equal(periodLastDay('2026-12', 5), '2027-01-04')
})

test('期間：月末（0）是每月最後一天，期間長度隨月份變', () => {
  assert.equal(periodStart('2026-11', 0), '2026-11-30')
  assert.deepEqual(periodBounds('2026-11', 0), { start: '2026-11-30', end: '2026-12-31' })
  assert.equal(periodLastDay('2026-11', 0), '2026-12-30')
  assert.deepEqual(periodBounds('2026-01', 0), { start: '2026-01-31', end: '2026-02-28' })
  assert.equal(monthKeyOf('2026-11-29', 0), '2026-10')
  assert.equal(monthKeyOf('2026-11-30', 0), '2026-11')
  assert.equal(monthKeyOf('2026-12-15', 0), '2026-11')
  assert.equal(monthKeyOf('2026-12-31', 0), '2026-12')
  // 每一天恰好屬於一個期間：期間邊界銜接
  assert.equal(periodBounds('2026-11', 0).end, periodStart('2026-12', 0))
})

test('期間：切換期間與選期間時的日期', () => {
  const today = '2026-11-24'
  assert.equal(shiftMonthDate('2026-11-24', -1, today, 5), '2026-10-05') // 11/24 在 11/5 期，上一期從 10/5 開始
  assert.equal(shiftMonthDate('2026-10-05', 1, today, 5), '2026-11-24') // 回到今天所在的期
  assert.equal(shiftMonthDate('2026-11-03', 1, today, 5), '2026-11-24') // 11/3 在 10 期，下一期是 11 期，含今天
  assert.equal(dateForMonth('2026-09', today, 5), '2026-09-05')
  assert.equal(dateForMonth('2026-11', today, 5), today)
})

test('periodSettings：沒設定是日曆月份、週日開頭', () => {
  assert.deepEqual(periodSettings({}), { monthStartDay: 1, weekStartDay: 0 })
  assert.deepEqual(periodSettings({ monthStartDay: 0, weekStartDay: 6 }), { monthStartDay: 0, weekStartDay: 6 })
  assert.deepEqual(periodSettings(null), { monthStartDay: 1, weekStartDay: 0 })
})
