import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sumSaved, progressRatio, progressPercent, daysLeft, isValidAmount } from './savings.js'

const save = (amount) => ({ type: 'save', amount })
const withdraw = (amount) => ({ type: 'withdraw', amount })

test('sumSaved 存款減提款', () => {
  assert.equal(sumSaved([save(100), withdraw(30)]), 70)
})

test('sumSaved 提款超過存款為負', () => {
  assert.equal(sumSaved([save(100), withdraw(150)]), -50)
})

test('sumSaved 小數不累積誤差', () => {
  assert.equal(sumSaved([save(0.1), save(0.2)]), 0.3)
})

test('sumSaved 空陣列為 0', () => {
  assert.equal(sumSaved([]), 0)
})

test('sumSaved 結果為零時不是 -0', () => {
  assert.ok(Object.is(sumSaved([save(0.3), withdraw(0.1), withdraw(0.2)]), 0))
})

test('progressPercent 浮點誤差不會少 1%', () => {
  assert.equal(progressPercent(29, 100), 29)
  assert.equal(progressPercent(57, 100), 57)
  assert.equal(progressPercent(58, 100), 58)
})

test('progressPercent 無條件捨去且夾在 0～100', () => {
  assert.equal(progressPercent(1, 3), 33)
  assert.equal(progressPercent(250, 100), 100)
  assert.equal(progressPercent(-5, 100), 0)
})

test('isValidAmount 接受 0.01 以上、最多 2 位小數的金額', () => {
  for (const n of [100, 0.5, 1.15, 19.99, 0.01, 999999999999.99 - 1]) assert.equal(isValidAmount(n), true, String(n))
})

test('isValidAmount 拒絕 0、負數、非數字、過大與超過 2 位小數', () => {
  for (const n of [0, -1, NaN, Infinity, 1e12, 0.004, 0.001, 1.005, 2.345]) assert.equal(isValidAmount(n), false, String(n))
})

test('progressRatio 一半', () => {
  assert.equal(progressRatio(50, 100), 0.5)
})

test('progressRatio 超過目標夾在 1', () => {
  assert.equal(progressRatio(120, 100), 1)
})

test('progressRatio 負餘額夾在 0', () => {
  assert.equal(progressRatio(-50, 100), 0)
})

test('progressRatio 目標為 0 回傳 0', () => {
  assert.equal(progressRatio(10, 0), 0)
})

test('daysLeft 未來、今天、過期、無日期、跨月', () => {
  assert.equal(daysLeft('2026-11-12', '2026-11-02'), 10)
  assert.equal(daysLeft('2026-11-02', '2026-11-02'), 0)
  assert.equal(daysLeft('2026-11-01', '2026-11-02'), -1)
  assert.equal(daysLeft(null, '2026-11-02'), null)
  assert.equal(daysLeft('2026-12-01', '2026-11-30'), 1)
})
