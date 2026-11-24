import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pressKey, evaluateExpression, commitExpression, hasOperator, MAX_NUMBER_DIGITS } from './expression.js'

const press = (keys, start = '') => [...keys].reduce((e, k) => pressKey(e, k), start)

test('pressKey：輸入數字與小數點', () => {
  assert.equal(press('120'), '120')
  assert.equal(press('.'), '0.')
  assert.equal(press('1.5'), '1.5')
  assert.equal(press('1.5.2'), '1.52') // 第二個小數點被忽略
  assert.equal(press('5+.'), '5+0.')
})

test('pressKey：前導 0 會被取代', () => {
  assert.equal(press('05'), '5')
  assert.equal(press('00'), '0')
  assert.equal(press('100'), '100')
  assert.equal(press('0.5'), '0.5')
  assert.equal(press('5+07'), '5+7')
})

test('pressKey：運算符不能在開頭，連按是取代，結尾小數點會被拿掉', () => {
  assert.equal(press('+'), '')
  assert.equal(press('×'), '')
  assert.equal(press('5+×'), '5×')
  assert.equal(press('5++−'), '5−')
  assert.equal(press('5.+'), '5+')
})

test('pressKey：⌫ 刪最後一個字元', () => {
  assert.equal(press('12+⌫'), '12')
  assert.equal(press('1⌫⌫⌫'), '')
})

test('pressKey：單一數字最多 9 位（不含小數點），運算符後重新計算', () => {
  const full = '1'.repeat(MAX_NUMBER_DIGITS)
  assert.equal(press('1', full), full)
  assert.equal(press('1', '12345678.9'), '12345678.9')
  assert.equal(press('+1', full), `${full}+1`)
})

test('pressKey：不認得的鍵不改變算式', () => {
  assert.equal(pressKey('12', 'a'), '12')
  assert.equal(pressKey('12', ''), '12')
  assert.equal(pressKey('12', '-'), '12') // 半形減號不是運算符
})

test('hasOperator', () => {
  assert.equal(hasOperator('12'), false)
  assert.equal(hasOperator('12+3'), true)
})

test('evaluateExpression：基本運算與先乘除後加減', () => {
  assert.equal(evaluateExpression('120+80'), 200)
  assert.equal(evaluateExpression('2+3×4'), 14)
  assert.equal(evaluateExpression('12×3−4'), 32)
  assert.equal(evaluateExpression('100−20−30'), 50)
  assert.equal(evaluateExpression('8÷2×3'), 12)
  assert.equal(evaluateExpression('10÷4'), 2.5)
  assert.equal(evaluateExpression('2×3×4'), 24)
})

test('evaluateExpression：空算式是 0、結尾運算符與小數點忽略', () => {
  assert.equal(evaluateExpression(''), 0)
  assert.equal(evaluateExpression('5+'), 5)
  assert.equal(evaluateExpression('5×÷'), 5)
  assert.equal(evaluateExpression('5.'), 5)
})

test('evaluateExpression：浮點誤差不外露，可為負數', () => {
  assert.equal(evaluateExpression('0.1+0.2'), 0.3)
  assert.equal(evaluateExpression('5−8'), -3)
})

test('evaluateExpression：除以 0 無效', () => {
  assert.equal(evaluateExpression('5÷0'), null)
  assert.equal(evaluateExpression('10÷0+5'), null)
  assert.equal(evaluateExpression('0÷5'), 0)
})

test('commitExpression：算成單一數字（字串），四捨五入到指定小數位', () => {
  assert.equal(commitExpression('120+80'), '200')
  assert.equal(commitExpression('10÷3'), '3.33')
  assert.equal(commitExpression('10÷4', 0), '3')
  assert.equal(commitExpression('0.5+0.25', 2), '0.75')
})

test('commitExpression：金額必須大於 0，其餘清空', () => {
  assert.equal(commitExpression('5−8'), '')
  assert.equal(commitExpression('5÷0'), '')
  assert.equal(commitExpression(''), '')
  assert.equal(commitExpression('0'), '')
  assert.equal(commitExpression('0.001'), '') // 四捨五入成 0
})
