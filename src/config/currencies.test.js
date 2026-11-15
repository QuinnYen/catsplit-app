import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CURRENCIES, getCurrency, currencyName, roundToCurrency, formatRate } from './currencies.js'

test('貨幣清單：代碼不重複、符號與小數位數齊全', () => {
  const codes = CURRENCIES.map(c => c.code)
  assert.equal(new Set(codes).size, codes.length)
  for (const c of CURRENCIES) {
    assert.match(c.code, /^[A-Z]{3}$/)
    assert.ok(c.symbol, `${c.code} 缺符號`)
    assert.ok([0, 2].includes(c.decimals), `${c.code} 小數位數不合理`)
  }
})

test('貨幣清單：維持原本的 5 種與符號，既有資料不受影響', () => {
  assert.deepEqual(['TWD', 'JPY', 'USD', 'EUR', 'CNY'].map(c => getCurrency(c).symbol), ['NT$', '¥', '$', '€', 'CN¥'])
})

test('getCurrency：不認得的代碼退回第一個', () => {
  assert.equal(getCurrency('XXX').code, 'TWD')
})

test('currencyName：依語言產生名稱', () => {
  assert.equal(currencyName('JPY', 'zh-TW'), '日圓')
  assert.equal(currencyName('JPY', 'en'), 'Japanese Yen')
})

test('roundToCurrency：依小數位數四捨五入', () => {
  assert.equal(roundToCurrency(1234.567, 'JPY'), 1235)
  assert.equal(roundToCurrency(12.345, 'USD'), 12.35)
})

test('formatRate：保留 4 位有效數字', () => {
  assert.equal(formatRate(0.20591234), 0.2059)
  assert.equal(formatRate(40.608715), 40.61)
  assert.equal(formatRate(0.00127934), 0.001279)
})
