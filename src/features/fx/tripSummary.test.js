import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tripTotals, groupByDate } from './tripSummary.js'

const ts = (ms) => ({ toMillis: () => ms })
const tx = (o) => ({ type: 'expense', currency: 'JPY', amount: 1000, baseAmount: 210, date: '2026-11-08', createdAt: ts(1), ...o })
const trip = { currency: 'JPY' }

test('tripTotals：支出扣掉收入；旅遊幣別只加同幣別；轉帳不計但算一筆', () => {
  const list = [
    tx({ amount: 1000, baseAmount: 210 }),
    tx({ amount: 500, baseAmount: 105 }),
    tx({ type: 'income', amount: 200, baseAmount: 42 }), // 退稅
    tx({ currency: 'TWD', amount: 100, baseAmount: 100 }), // 別的幣別：只進統計幣別
    tx({ type: 'transfer', baseAmount: undefined, amount: 9999 }),
  ]
  assert.deepEqual(tripTotals(list, trip), { base: 373, own: 1300, count: 5 })
  assert.deepEqual(tripTotals([], trip), { base: 0, own: 0, count: 0 })
})

test('tripTotals：小數不累積誤差', () => {
  const list = [tx({ amount: 0.1, baseAmount: 0.1 }), tx({ amount: 0.2, baseAmount: 0.2 })]
  assert.deepEqual(tripTotals(list, trip), { base: 0.3, own: 0.3, count: 2 })
})

test('groupByDate：日期新到舊，同日依建立時間新到舊（剛寫入的最前），每日小計是支出 − 收入', () => {
  const list = [
    tx({ id: 'a', date: '2026-11-07', baseAmount: 100, createdAt: ts(1) }),
    tx({ id: 'b', date: '2026-11-08', baseAmount: 300, createdAt: ts(2) }),
    tx({ id: 'c', date: '2026-11-08', baseAmount: 50, createdAt: ts(9) }),
    tx({ id: 'd', date: '2026-11-08', type: 'income', baseAmount: 20, createdAt: ts(5) }),
    tx({ id: 'e', date: '2026-11-08', baseAmount: 10, createdAt: undefined }), // 剛寫入
  ]
  const g = groupByDate(list)
  assert.deepEqual(g.map((x) => x.date), ['2026-11-08', '2026-11-07'])
  assert.deepEqual(g[0].items.map((x) => x.id), ['e', 'c', 'd', 'b'])
  assert.equal(g[0].net, 340) // 300 + 50 + 10 − 20
  assert.equal(g[1].net, 100)
  assert.deepEqual(groupByDate([]), [])
})
