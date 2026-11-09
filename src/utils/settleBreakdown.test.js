import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPersonBreakdown } from './settleBreakdown.js'
import { computeMemberBalances } from './expenseHelpers.js'

const expenses = [
  { amount: 300, payments: { a: 300 }, splits: { a: 100, b: 100, c: 100 } },
  { amount: 90, payments: { b: 90 }, splits: { a: 30, b: 30, c: 30 } },
]
const settlements = [{ from: 'c', to: 'a', amount: 50 }]
const incomes = [
  { amount: 60, received: { a: 60 }, splits: { a: 20, b: 20, c: 20 } },
  { amount: 90, isSponsorship: true, received: { b: 90 }, splits: { a: 45, c: 45 } },
]

test('各來源分開算：付了、應付、已結清、收入、贊助', () => {
  const a = buildPersonBreakdown('a', { expenses, settlements, incomes })
  assert.deepEqual(a, { paid: 300, owes: 130, settled: -50, income: -40, sponsor: 45, net: 125 })
  const c = buildPersonBreakdown('c', { expenses, settlements, incomes })
  assert.equal(c.settled, 50)
  assert.equal(c.sponsor, 45)
})

test('每個人的合計淨額都等於 computeMemberBalances 的結果', () => {
  const all = computeMemberBalances(['a', 'b', 'c'], expenses, settlements, incomes)
  for (const uid of ['a', 'b', 'c']) {
    const { net } = buildPersonBreakdown(uid, { expenses, settlements, incomes })
    assert.ok(Math.abs(net - all[uid]) < 1e-9, `${uid}: ${net} vs ${all[uid]}`)
  }
})

test('沒有轉帳、收入、贊助時，只剩付了與應付', () => {
  const r = buildPersonBreakdown('b', { expenses, settlements: [], incomes: [] })
  assert.deepEqual(r, { paid: 90, owes: 130, settled: 0, income: 0, sponsor: 0, net: -40 })
})
