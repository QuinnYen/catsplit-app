import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSetting, parseShortcut, mergeFxSettings, MAX_SHORTCUTS, MAX_CUSTOM_RATES, customRateKey, setCustomRate, removeCustomRate } from './fxSettings.js'
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
  assert.deepEqual(m, { decimals: 2, defaultAmount: 100, showSymbol: false, taxFreePercent: 8, cardFeePercent: 1.5, serviceFeePercent: 10, addTaxPercent: 8, tipPercent: 15, customShortcuts: [], customRates: {}, rows: ['TWD', 'JPY', 'USD'] })
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

test('mergeFxSettings：換算列要合法才用，否則退回預設', () => {
  assert.deepEqual(mergeFxSettings({ rows: ['JPY', 'EUR'] }).rows, ['JPY', 'EUR'])
  for (const bad of [[], ['JPY', 'JPY'], ['XXX'], 'JPY', ['TWD', 'JPY', 'USD', 'EUR', 'CNY', 'KRW', 'HKD']]) assert.deepEqual(mergeFxSettings({ rows: bad }).rows, ['TWD', 'JPY', 'USD'])
})

test('parseSetting：服務費、外加稅、小費和免稅、刷卡一樣是 0–100', () => {
  for (const f of ['serviceFeePercent', 'addTaxPercent', 'tipPercent']) {
    assert.deepEqual(parseSetting(f, '12.5'), { ok: true, value: 12.5 })
    assert.equal(parseSetting(f, '101').reason, 'percent')
    assert.equal(parseSetting(f, '').reason, 'percent')
  }
})

test('parseShortcut：名稱 1–12 字、百分比大於 0 到 100、加收或扣除', () => {
  assert.deepEqual(parseShortcut({ name: ' 折扣 ', percent: '5', kind: 'deduct' }), { ok: true, value: { name: '折扣', percent: 5, kind: 'deduct' } })
  assert.equal(parseShortcut({ name: '', percent: 5, kind: 'add' }).reason, 'name')
  assert.equal(parseShortcut({ name: 'x'.repeat(13), percent: 5, kind: 'add' }).reason, 'name')
  for (const p of ['0', '-1', '101', 'abc', '']) assert.equal(parseShortcut({ name: 'a', percent: p, kind: 'add' }).reason, 'percent', p)
  assert.equal(parseShortcut({ name: 'a', percent: 5, kind: 'x' }).reason, 'kind')
})

test('mergeFxSettings：自訂捷徑壞的略過、重複 id 只留第一個、最多 8 個', () => {
  const good = { id: 'a', name: '折扣', percent: 5, kind: 'deduct' }
  const m = mergeFxSettings({ customShortcuts: [good, { ...good, name: '重複' }, { id: 'b', name: '', percent: 5, kind: 'add' }, { id: 'c', name: 'x', percent: 0, kind: 'add' }, null, { name: 'noid', percent: 5, kind: 'add' }] })
  assert.deepEqual(m.customShortcuts, [good])
  assert.deepEqual(mergeFxSettings({ customShortcuts: 'x' }).customShortcuts, [])
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, name: `n${i}`, percent: 1, kind: 'add' }))
  assert.equal(mergeFxSettings({ customShortcuts: many }).customShortcuts.length, MAX_SHORTCUTS)
})

test('mergeFxSettings 不改動預設值物件', () => {
  const before = JSON.stringify(DEFAULT_FX_SETTINGS)
  mergeFxSettings({ decimals: 3, customRates: { JPY_TWD: 1 } })
  assert.equal(JSON.stringify(DEFAULT_FX_SETTINGS), before)
})

test('customRateKey', () => {
  assert.equal(customRateKey('JPY', 'TWD'), 'JPY_TWD')
})

test('setCustomRate：新增與修改，輸入的物件不被改動，匯率最多 8 位有效數字', () => {
  const before = { JPY_TWD: 0.2 }
  const added = setCustomRate(before, 'USD', 'TWD', ' 31.5 ')
  assert.deepEqual(added, { ok: true, customRates: { JPY_TWD: 0.2, USD_TWD: 31.5 } })
  assert.deepEqual(before, { JPY_TWD: 0.2 })
  assert.deepEqual(setCustomRate(before, 'JPY', 'TWD', '0.21').customRates, { JPY_TWD: 0.21 }) // 同一組是修改
  assert.equal(setCustomRate({}, 'JPY', 'TWD', '0.123456789123').customRates.JPY_TWD, 0.12345679)
})

test('setCustomRate：新增 A→B 會移除反向的 B→A，一組幣別只留一筆', () => {
  assert.deepEqual(setCustomRate({ TWD_JPY: 5, USD_TWD: 31 }, 'JPY', 'TWD', '0.2').customRates, { JPY_TWD: 0.2, USD_TWD: 31 })
})

test('setCustomRate：錯誤的輸入', () => {
  assert.equal(setCustomRate({}, 'JPY', 'JPY', '1').reason, 'same')
  for (const bad of ['', 'abc', '0', '-1', '1e9', 'Infinity', null, undefined]) assert.equal(setCustomRate({}, 'JPY', 'TWD', bad).reason, 'rate', String(bad))
})

test('setCustomRate：超過上限不能再新增，但可以修改既有的，或用反向取代', () => {
  const full = Object.fromEntries(Array.from({ length: MAX_CUSTOM_RATES }, (_, i) => [`${String.fromCharCode(65 + (i % 26))}AA_TWD`, 1 + i]))
  assert.equal(setCustomRate(full, 'JPY', 'KRW', '1').reason, 'limit')
  assert.equal(setCustomRate(full, 'AAA', 'TWD', '2').ok, true) // 修改既有
  const withReverse = { ...full, TWD_JPY: 5 }
  delete withReverse.TAA_TWD // 騰出一個位置，再讓反向取代
  assert.equal(setCustomRate(withReverse, 'JPY', 'TWD', '0.2').ok, true)
})

test('removeCustomRate：移除一組，輸入的物件不被改動', () => {
  const before = { JPY_TWD: 0.2, USD_TWD: 31.5 }
  assert.deepEqual(removeCustomRate(before, 'JPY_TWD'), { USD_TWD: 31.5 })
  assert.deepEqual(before, { JPY_TWD: 0.2, USD_TWD: 31.5 })
  assert.deepEqual(removeCustomRate(before, 'XXX_YYY'), before)
})
