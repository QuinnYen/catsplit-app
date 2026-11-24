import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toDateStr, todayStr, monthKeyOf, weekdayOf, shiftMonthDate, dateForMonth, shortDate } from './dates.js'

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
