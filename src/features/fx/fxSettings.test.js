import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSetting, mergeFxSettings, MAX_CUSTOM_RATES } from './fxSettings.js'
import { DEFAULT_FX_SETTINGS } from './fxMath.js'

test('parseSetting：小數位數是 0–3 的整數', () => {
  assert.deepEqual(parseSetting('decimals', '2'), { ok: true, value: 2 })
  assert.deepEqual(parseSetting('decimals', 0), { ok: true, value: 0 })
  for (const bad of ['4', '-1', '1.5', 'abc', '']) assert.equal(parseSetting('decimals', bad).reason, 'number', bad)
})

test('parseSetting：預設金額可以是 0 或留空，不能是負數或超大', () => {
  assert.deepEqual(parseSetting('defaultAmount', '1'), { ok: true, value: 1 })
  assert.deepEqual(parseSetting('defaultAmount', ' 100.5 '), { ok: true, value: 100.5 })
  assert.deepEqual(parseSetting('defaultAmount', ''), { ok: true, value: 0 })
  assert.deepEqual(parseSetting('defaultAmount', '0'), { ok: true, value: 0 })
  for (const bad of ['-1', 'abc', '1e12', 'Infinity']) assert.equal(parseSetting('defaultAmount', bad).reason, 'amount', bad)
})

test('parseSetting：免稅與刷卡百分比 0–100，最多兩位小數，不能留空', () => {
  assert.deepEqual(parseSetting('taxFreePercent', '10'), { ok: true, value: 10 })
  assert.deepEqual(parseSetting('cardFeePercent', '1.567'), { ok: true, value: 1.57 })
  assert.deepEqual(parseSetting('cardFeePercent', '0'), { ok: true, value: 0 })
  assert.deepEqual(parseSetting('cardFeePercent', '100'), { ok: true, value: 100 })
  for (const bad of ['-0.1', '100.1', 'abc', '']) assert.equal(parseSetting('cardFeePercent', bad).reason, 'percent', bad)
})

test('parseSetting：顯示符號只收布林', () => {
  assert.deepEqual(parseSetting('showSymbol', false), { ok: true, value: false })
  assert.equal(parseSetting('showSymbol', 'false').ok, false)
  assert.equal(parseSetting('unknown', '1').ok, false)
})

test('mergeFxSettings：沒有文件或空文件用預設值', () => {
  assert.deepEqual(mergeFxSettings(undefined), DEFAULT_FX_SETTINGS)
  assert.deepEqual(mergeFxSettings({}), DEFAULT_FX_SETTINGS)
  assert.deepEqual(mergeFxSettings(null), DEFAULT_FX_SETTINGS)
})

test('mergeFxSettings：有的欄位用存的值，壞掉的欄位退回預設值', () => {
  const m = mergeFxSettings({ decimals: 2, defaultAmount: 100, showSymbol: false, taxFreePercent: 8, cardFeePercent: 999 })
  assert.deepEqual(m, { decimals: 2, defaultAmount: 100, showSymbol: false, taxFreePercent: 8, cardFeePercent: 1.5, customRates: {} })
  assert.equal(mergeFxSettings({ decimals: '2' }).decimals, DEFAULT_FX_SETTINGS.decimals) // 型別不對
  assert.equal(mergeFxSettings({ decimals: 9 }).decimals, DEFAULT_FX_SETTINGS.decimals)
  assert.equal(mergeFxSettings({ showSymbol: 'no' }).showSymbol, true)
})

test('mergeFxSettings：自訂匯率只留格式對、值為正數的項目，最多 20 組', () => {
  const m = mergeFxSettings({ customRates: { JPY_TWD: 0.21, USD_TWD: 31.5, bad: 1, JPY_JPY: 1, EUR_TWD: -2, CNY_TWD: 'x', usd_twd: 3 } })
  assert.deepEqual(m.customRates, { JPY_TWD: 0.21, USD_TWD: 31.5 })
  assert.deepEqual(mergeFxSettings({ customRates: [1, 2] }).customRates, {})
  assert.deepEqual(mergeFxSettings({ customRates: 'x' }).customRates, {})
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`${String.fromCharCode(65 + (i % 26))}AA_TWD`, 1 + i]))
  assert.equal(Object.keys(mergeFxSettings({ customRates: many }).customRates).length, MAX_CUSTOM_RATES)
})

test('mergeFxSettings 不改動預設值物件', () => {
  const before = JSON.stringify(DEFAULT_FX_SETTINGS)
  mergeFxSettings({ decimals: 3, customRates: { JPY_TWD: 1 } })
  assert.equal(JSON.stringify(DEFAULT_FX_SETTINGS), before)
})
