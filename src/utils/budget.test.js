import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBudgetStatus } from './budget.js'

const budget = { amount: 1000, period: { type: 'trip' } }

test('無預算回傳 null', () => {
  assert.equal(computeBudgetStatus(undefined, { totalAmount: 500 }), null)
  assert.equal(computeBudgetStatus(null, { totalAmount: 500 }), null)
})

test('淨額 0：剩餘等於預算、ok', () => {
  const s = computeBudgetStatus(budget, { totalAmount: 0, totalIncome: 0 })
  assert.deepEqual(s, { amount: 1000, spent: 0, remaining: 1000, ratio: 0, level: 'ok', periodType: 'trip' })
})

test('淨額為負：ratio 為負、剩餘大於預算、ok', () => {
  const s = computeBudgetStatus(budget, { totalAmount: 100, totalIncome: 300 })
  assert.equal(s.spent, -200)
  assert.equal(s.remaining, 1200)
  assert.ok(s.ratio < 0)
  assert.equal(s.level, 'ok')
})

test('未滿 80% 為 ok', () => {
  assert.equal(computeBudgetStatus(budget, { totalAmount: 799.99 }).level, 'ok')
})

test('剛好 80% 為 warn', () => {
  const s = computeBudgetStatus(budget, { totalAmount: 800 })
  assert.equal(s.level, 'warn')
  assert.equal(s.remaining, 200)
})

test('剛好 100% 為 over、剩餘 0', () => {
  const s = computeBudgetStatus(budget, { totalAmount: 1000 })
  assert.equal(s.level, 'over')
  assert.equal(s.remaining, 0)
})

test('超支：剩餘為負', () => {
  const s = computeBudgetStatus(budget, { totalAmount: 1250.5 })
  assert.equal(s.level, 'over')
  assert.equal(s.remaining, -250.5)
})

test('浮點誤差：累加後剛好達門檻仍判斷正確', () => {
  // 0.1 + 0.2 = 0.30000000000000004；0.7 + 0.1 = 0.7999999999999999
  assert.equal(computeBudgetStatus({ amount: 0.3 }, { totalAmount: 0.1 + 0.2 }).level, 'over')
  assert.equal(computeBudgetStatus({ amount: 1 }, { totalAmount: 0.7 + 0.1 }).level, 'warn')
  assert.equal(computeBudgetStatus({ amount: 1 }, { totalAmount: 0.7 + 0.1 }).spent, 0.8)
})

test('totalIncome 缺漏當 0', () => {
  assert.equal(computeBudgetStatus(budget, { totalAmount: 300 }).spent, 300)
})

test('totals 欄位全缺當 0', () => {
  assert.equal(computeBudgetStatus(budget, {}).spent, 0)
})

test('period 缺漏當 trip', () => {
  assert.equal(computeBudgetStatus({ amount: 1000 }, { totalAmount: 0 }).periodType, 'trip')
})

test('delta：新增支出預覽', () => {
  const s = computeBudgetStatus(budget, { totalAmount: 700 }, { delta: 150 })
  assert.equal(s.spent, 850)
  assert.equal(s.level, 'warn')
})

test('delta 為負：新增收入預覽', () => {
  assert.equal(computeBudgetStatus(budget, { totalAmount: 900 }, { delta: -200 }).spent, 700)
})

test('replace：同金額編輯等於原狀態', () => {
  const totals = { totalAmount: 850, totalIncome: 50 }
  assert.deepEqual(computeBudgetStatus(budget, totals, { replace: 120, delta: 120 }), computeBudgetStatus(budget, totals))
})

test('replace：把支出改大造成超支', () => {
  const s = computeBudgetStatus(budget, { totalAmount: 900 }, { replace: 100, delta: 300 })
  assert.equal(s.spent, 1100)
  assert.equal(s.level, 'over')
})

test('replace 為負：把收入改小使淨額上升', () => {
  // 原收入 200（貢獻 −200），改成 50（貢獻 −50）
  const s = computeBudgetStatus(budget, { totalAmount: 1000, totalIncome: 200 }, { replace: -200, delta: -50 })
  assert.equal(s.spent, 950)
  assert.equal(s.level, 'warn')
})
