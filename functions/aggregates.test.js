import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffAggregates, normalizeAggregates, round2 } from './aggregates.js'

const base = { totalAmount: 100, totalExpenses: 2, totalIncome: 0, incomeCount: 0, memberBalances: { a: 50, b: -50 }, memberExpenseCounts: { a: 2, b: 1 } }

test('diffAggregates：一致時沒有差異；浮點誤差與沒存的 0 不算差異', () => {
  assert.deepEqual(diffAggregates(base, base), [])
  assert.deepEqual(diffAggregates({ ...base, totalAmount: 100.0000000001, memberBalances: { a: 50.000001, b: -50 } }, base), [])
  // 舊群組沒有 totalIncome、incomeCount、成員餘額為 0 的人沒存
  const old = { totalAmount: 100, totalExpenses: 2, memberBalances: { a: 50, b: -50 }, memberExpenseCounts: { a: 2, b: 1 } }
  assert.deepEqual(diffAggregates(old, { ...base, memberBalances: { a: 50, b: -50, c: 0 } }), [])
})

test('diffAggregates：列出每個差異的欄位、成員、存的值與重算值', () => {
  const stored = { ...base, totalExpenses: 3, memberBalances: { a: 40, b: -50 }, memberExpenseCounts: { a: 2, b: 1, ghost: 4 } }
  assert.deepEqual(diffAggregates(stored, base), [
    { field: 'totalExpenses', stored: 3, expected: 2 },
    { field: 'memberBalances', key: 'a', stored: 40, expected: 50 },
    { field: 'memberExpenseCounts', key: 'ghost', stored: 4, expected: 0 },
  ])
})

test('diffAggregates：存的資料是空的或型別不對也能比', () => {
  assert.equal(diffAggregates(undefined, base).length, 6) // 2 個總計、2 個餘額、2 個筆數
  assert.equal(diffAggregates({ ...base, memberBalances: 'x' }, base).some((d) => d.field === 'memberBalances'), true)
  assert.deepEqual(diffAggregates({}, { memberBalances: {}, memberExpenseCounts: {} }), [])
})

test('normalizeAggregates：金額與餘額取到分，筆數保持整數，缺的欄位補 0', () => {
  assert.equal(round2(0.1 + 0.2), 0.3)
  assert.deepEqual(normalizeAggregates({ totalAmount: 0.1 + 0.2, totalExpenses: 1, memberBalances: { a: 0.1 + 0.2 }, memberExpenseCounts: { a: 1 } }),
    { totalAmount: 0.3, totalExpenses: 1, totalIncome: 0, incomeCount: 0, memberBalances: { a: 0.3 }, memberExpenseCounts: { a: 1 } })
})
