import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toMonthKey, monthRange, shiftMonth, latestMonthKey, summarizeLoaded } from './monthRange.js'

test('toMonthKey：月份補零', () => {
  assert.equal(toMonthKey(new Date(2026, 0, 31)), '2026-01')
  assert.equal(toMonthKey(new Date(2026, 10, 1)), '2026-11')
})

test('monthRange：[當月 1 日, 下月 1 日)，12 月會進位到隔年', () => {
  const { start, end } = monthRange('2026-12')
  assert.deepEqual([start.getFullYear(), start.getMonth(), start.getDate()], [2026, 11, 1])
  assert.deepEqual([end.getFullYear(), end.getMonth(), end.getDate()], [2027, 0, 1])
})

test('monthRange：月底最後一刻屬於當月，下月 1 日 0 點屬於下月', () => {
  const { start, end } = monthRange('2026-02')
  const lastMoment = new Date(2026, 1, 28, 23, 59, 59)
  assert.ok(lastMoment >= start && lastMoment < end)
  assert.ok(!(new Date(2026, 2, 1, 0, 0, 0) < end))
})

test('shiftMonth：跨年前後移動', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-11', 0), '2026-11')
})

test('latestMonthKey：取最晚的帳所在月份，沒有帳用現在', () => {
  const a = new Date(2026, 8, 15).getTime()
  const b = new Date(2026, 9, 3).getTime()
  assert.equal(latestMonthKey([a, b], 0), '2026-10')
  assert.equal(latestMonthKey([], new Date(2026, 10, 9).getTime()), '2026-11')
})

test('summarizeLoaded：贊助不算收入', () => {
  const r = summarizeLoaded(
    [{ amount: 100 }, { amount: 50 }],
    [{ amount: 30 }, { amount: 999, isSponsorship: true }],
  )
  assert.deepEqual(r, { count: 2, expenseTotal: 150, incomeTotal: 30 })
})
