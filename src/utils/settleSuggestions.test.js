import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeSettleSuggestions } from './settleSuggestions.js'
import { computeMemberBalances } from './expenseHelpers.js'

// 照建議轉完後，把轉帳當成結清紀錄重算餘額，應該沒有任何需要再轉的建議
const settleAll = (members, expenses, base) => {
  const first = computeSettleSuggestions(computeMemberBalances(members, expenses), base)
  const after = computeSettleSuggestions(computeMemberBalances(members, expenses, first), base)
  return { first, after }
}

test('美元：12.50 不被取整成 13，轉完後沒有剩餘建議', () => {
  const expenses = [{ payments: { a: 25 }, splits: { a: 12.5, b: 12.5 } }]
  const { first, after } = settleAll(['a', 'b'], expenses, 'USD')
  assert.deepEqual(first, [{ from: 'b', to: 'a', amount: 12.5 }])
  assert.deepEqual(after, [])
})

test('美元：12.30 轉完後不會留下被隱藏的 0.30', () => {
  const expenses = [{ payments: { a: 24.6 }, splits: { a: 12.3, b: 12.3 } }]
  const { first, after } = settleAll(['a', 'b'], expenses, 'USD')
  assert.deepEqual(first, [{ from: 'b', to: 'a', amount: 12.3 }])
  assert.deepEqual(after, [])
})

test('日圓：整數建議，不足 1 圓的零頭不列', () => {
  const expenses = [{ payments: { a: 1000.4 }, splits: { a: 500.2, b: 500.2 } }]
  const { first } = settleAll(['a', 'b'], expenses, 'JPY')
  assert.deepEqual(first, [{ from: 'b', to: 'a', amount: 500 }])
  assert.deepEqual(computeSettleSuggestions({ a: 0.3, b: -0.3 }, 'JPY'), [])
})

test('三人：最少轉帳次數，總額守恆', () => {
  const sug = computeSettleSuggestions({ a: 30, b: -10, c: -20 }, 'USD')
  assert.equal(sug.length, 2)
  assert.equal(sug.reduce((s, x) => s + x.amount, 0), 30)
})
