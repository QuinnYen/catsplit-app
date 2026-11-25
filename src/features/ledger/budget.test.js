import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetStatus, parseBudgetInput } from './budget.js'

test('budgetStatus：沒有預算回 null；剩餘、比例與等級', () => {
  assert.equal(budgetStatus(undefined, 100), null)
  assert.equal(budgetStatus(0, 100), null)
  assert.deepEqual(budgetStatus(1000, 500), { amount: 1000, spent: 500, remaining: 500, ratio: 0.5, level: 'ok' })
  assert.equal(budgetStatus(1000, 800).level, 'warn')
  assert.equal(budgetStatus(1000, 999.99).level, 'warn')
  assert.equal(budgetStatus(1000, 1000).level, 'over') // 剛好用完算超支門檻
  assert.deepEqual(budgetStatus(1000, 1200), { amount: 1000, spent: 1200, remaining: -200, ratio: 1.2, level: 'over' })
  assert.equal(budgetStatus(1000, 0.1 + 0.2).spent, 0.3) // 浮點誤差
  assert.equal(budgetStatus(1000, undefined).spent, 0)
})

test('parseBudgetInput：空白是取消，正數取兩位，無效回 undefined', () => {
  assert.equal(parseBudgetInput(''), null)
  assert.equal(parseBudgetInput('  '), null)
  assert.equal(parseBudgetInput('30000'), 30000)
  assert.equal(parseBudgetInput('100.555'), 100.56)
  assert.equal(parseBudgetInput('0'), undefined)
  assert.equal(parseBudgetInput('-5'), undefined)
  assert.equal(parseBudgetInput('abc'), undefined)
  assert.equal(parseBudgetInput('1e3'), undefined)
  assert.equal(parseBudgetInput('1000000000000'), undefined)
})
