import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthDateBounds, summarizeEntries, datesWithEntries, entriesOfDate, sumByCategory, isCounted } from './summary.js'

const tx = (o) => ({ type: 'expense', baseAmount: 100, date: '2026-11-24', category: 'food', ...o })

test('monthDateBounds：該月第一天到下個月第一天（含跨年）', () => {
  assert.deepEqual(monthDateBounds('2026-11'), { start: '2026-11-01', end: '2026-12-01' })
  assert.deepEqual(monthDateBounds('2026-12'), { start: '2026-12-01', end: '2027-01-01' })
  assert.deepEqual(monthDateBounds('2026-02'), { start: '2026-02-01', end: '2026-03-01' })
})

test('日期字串比較就能篩月份', () => {
  const { start, end } = monthDateBounds('2026-11')
  const inMonth = (d) => d >= start && d < end
  assert.equal(inMonth('2026-11-01'), true)
  assert.equal(inMonth('2026-11-30'), true)
  assert.equal(inMonth('2026-12-01'), false)
  assert.equal(inMonth('2026-10-31'), false)
})

test('summarizeEntries：支出、收入、結餘；轉帳不計', () => {
  const list = [tx({ baseAmount: 980 }), tx({ baseAmount: 14500 }), tx({ type: 'income', baseAmount: 800 }), tx({ type: 'transfer', baseAmount: undefined })]
  assert.deepEqual(summarizeEntries(list), { expense: 15480, income: 800, balance: -14680 })
  assert.deepEqual(summarizeEntries([]), { expense: 0, income: 0, balance: 0 })
})

test('summarizeEntries：小數不累積誤差', () => {
  assert.deepEqual(summarizeEntries([tx({ baseAmount: 0.1 }), tx({ baseAmount: 0.2 })]), { expense: 0.3, income: 0, balance: -0.3 })
})

test('isCounted：只有收入與支出計入收支', () => {
  assert.equal(isCounted(tx()), true)
  assert.equal(isCounted(tx({ type: 'income' })), true)
  assert.equal(isCounted(tx({ type: 'transfer' })), false)
})

test('datesWithEntries：月曆標點含轉帳', () => {
  const dates = datesWithEntries([tx({ date: '2026-11-03' }), tx({ type: 'transfer', date: '2026-11-05' }), tx({ date: '2026-11-03' })])
  assert.deepEqual([...dates].sort(), ['2026-11-03', '2026-11-05'])
})

test('entriesOfDate：當日明細與小計，保持傳入順序', () => {
  const list = [tx({ date: '2026-11-24', baseAmount: 180, title: 'a' }), tx({ date: '2026-11-23', baseAmount: 5 }), tx({ date: '2026-11-24', type: 'income', baseAmount: 50, title: 'b' })]
  const r = entriesOfDate(list, '2026-11-24')
  assert.deepEqual(r.items.map((t) => t.title), ['a', 'b'])
  assert.equal(r.expense, 180)
  assert.equal(r.income, 50)
  assert.equal(entriesOfDate(list, '2026-11-01').items.length, 0)
})

test('sumByCategory：由大到小、占比加總為 1，沒有分類歸其他', () => {
  const list = [tx({ category: 'food', baseAmount: 300 }), tx({ category: 'transport', baseAmount: 100 }), tx({ category: 'food', baseAmount: 100 }), tx({ category: '', baseAmount: 100 }), tx({ type: 'income', category: 'salary', baseAmount: 9999 })]
  const r = sumByCategory(list)
  assert.deepEqual(r.map((x) => [x.category, x.total]), [['food', 400], ['transport', 100], ['other', 100]])
  assert.ok(Math.abs(r.reduce((s, x) => s + x.ratio, 0) - 1) < 1e-12)
  assert.equal(r[0].ratio, 400 / 600)
})

test('sumByCategory：可算收入、沒有資料回空陣列', () => {
  assert.deepEqual(sumByCategory([tx({ type: 'income', category: 'salary', baseAmount: 42000 })], 'income').map((x) => x.category), ['salary'])
  assert.deepEqual(sumByCategory([]), [])
})
