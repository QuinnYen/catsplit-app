import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultRows, sanitizeRows, validCode, pairRate, convertRows, computePay, roundTo, formatFixed, recordAmount, isCustomPair, DEFAULT_FX_SETTINGS } from './fxMath.js'

// 以 USD 為 1 的匯率表（數字是為了好算，不是真實匯率）
const rates = { USD: 1, JPY: 160, TWD: 32, CNY: 7.2 }

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)

test('預設設定：截圖的預設值', () => {
  assert.deepEqual(DEFAULT_FX_SETTINGS, { decimals: 1, defaultAmount: 1, showSymbol: true, taxFreePercent: 10, cardFeePercent: 1.5, customRates: {} })
})

test('defaultRows：旅遊幣別、統計幣別在前，補常用幣別湊 4 列，不重複', () => {
  assert.deepEqual(defaultRows('JPY', 'TWD'), ['JPY', 'TWD', 'USD', 'CNY'])
  assert.deepEqual(defaultRows(null, 'TWD'), ['TWD', 'USD', 'JPY', 'CNY'])
  assert.deepEqual(defaultRows('USD', 'JPY'), ['USD', 'JPY', 'CNY', 'EUR'])
  assert.deepEqual(defaultRows('XXX', 'TWD'), ['TWD', 'USD', 'JPY', 'CNY']) // 不認得的幣別略過
})

test('sanitizeRows：不重複、認得的幣別、1–6 列，否則 null', () => {
  assert.deepEqual(sanitizeRows(['JPY', 'TWD']), ['JPY', 'TWD'])
  assert.equal(sanitizeRows([]), null)
  assert.equal(sanitizeRows(undefined), null)
  assert.equal(sanitizeRows('JPY'), null)
  assert.equal(sanitizeRows(['JPY', 'JPY']), null)
  assert.equal(sanitizeRows(['JPY', 'XXX']), null)
  assert.equal(sanitizeRows(['JPY', 'TWD', 'CNY', 'USD', 'EUR', 'KRW', 'HKD']), null)
  assert.equal(validCode('JPY'), 'JPY')
  assert.equal(validCode('XXX'), null)
  assert.equal(validCode(undefined), null)
})

test('pairRate：相同幣別 1、用對 USD 的匯率相除、缺資料 null', () => {
  assert.equal(pairRate(rates, {}, 'JPY', 'JPY'), 1)
  close(pairRate(rates, {}, 'JPY', 'TWD'), 0.2) // 1 JPY = 32/160 TWD
  close(pairRate(rates, {}, 'USD', 'JPY'), 160)
  close(pairRate(rates, {}, 'TWD', 'JPY'), 5)
  assert.equal(pairRate(rates, {}, 'JPY', 'KRW'), null)
  assert.equal(pairRate({}, {}, 'JPY', 'TWD'), null)
})

test('pairRate：自訂匯率優先（正向與反向），不影響其他幣別組合', () => {
  const custom = { JPY_TWD: 0.25 }
  assert.equal(pairRate(rates, custom, 'JPY', 'TWD'), 0.25)
  assert.equal(pairRate(rates, custom, 'TWD', 'JPY'), 4) // 反向用倒數
  close(pairRate(rates, custom, 'JPY', 'CNY'), 7.2 / 160)
  assert.equal(pairRate(rates, { JPY_TWD: 0 }, 'JPY', 'TWD') !== 0, true) // 0 或負數的自訂匯率無效
})

test('convertRows：每一列換算，缺匯率的列是 null，沒有金額全部 null', () => {
  const r = convertRows({ value: 1000, from: 'JPY', codes: ['JPY', 'TWD', 'KRW'], rates, custom: {} })
  assert.equal(r.JPY, 1000)
  close(r.TWD, 200)
  assert.equal(r.KRW, null)
  assert.deepEqual(convertRows({ value: null, from: 'JPY', codes: ['JPY', 'TWD'], rates, custom: {} }), { JPY: null, TWD: null })
})

test('computePay：免稅是除以 1.1、刷卡加在免稅後（截圖 4 的數字）', () => {
  // 截圖：換算結果 ¥12,733.7，免稅 −¥1,157.6，刷卡 +¥173.6，實付 ¥11,749.8
  const r = computePay({ amount: 12733.7, from: 'JPY', pay: 'JPY', rates, custom: {}, taxFree: true, taxPercent: 10, card: true, cardPercent: 1.5 })
  assert.equal(roundTo(r.taxDeduct, 1), 1157.6)
  assert.equal(roundTo(r.afterTax, 1), 11576.1)
  assert.equal(roundTo(r.fee, 1), 173.6)
  assert.equal(roundTo(r.total, 1), 11749.7) // 截圖的 .8 是畫面金額已四捨五入造成的 0.1 差
  assert.notEqual(roundTo(12733.7 * 0.9, 1), roundTo(r.afterTax, 1)) // 不是乘 0.9
})

test('computePay：只開其中一個、都不開、先換成實付幣別、缺匯率', () => {
  const only = (o) => computePay({ amount: 1100, from: 'JPY', pay: 'JPY', rates, custom: {}, taxFree: false, taxPercent: 10, card: false, cardPercent: 1.5, ...o })
  close(only({ taxFree: true }).total, 1000)
  close(only({ card: true }).total, 1116.5)
  assert.equal(only({}).total, 1100)
  assert.deepEqual(only({}), { gross: 1100, taxDeduct: 0, afterTax: 1100, fee: 0, total: 1100 })
  // 80 USD → 以 JPY 實付：80 × 160 = 12800
  close(computePay({ amount: 80, from: 'USD', pay: 'JPY', rates, custom: {}, taxFree: false, taxPercent: 10, card: false, cardPercent: 1.5 }).total, 12800)
  assert.equal(computePay({ amount: 80, from: 'USD', pay: 'KRW', rates, custom: {}, taxFree: false, taxPercent: 10, card: false, cardPercent: 1.5 }), null)
  assert.equal(computePay({ amount: null, from: 'USD', pay: 'JPY', rates, custom: {}, taxFree: false, taxPercent: 10, card: false, cardPercent: 1.5 }), null)
})

test('formatFixed：固定小數位數與千分位，沒有值顯示 —', () => {
  assert.equal(formatFixed(12733.74, 1), '12,733.7')
  assert.equal(formatFixed(0.2, 1), '0.2')
  assert.equal(formatFixed(0, 1), '0.0')
  assert.equal(formatFixed(1234.5, 0), '1,235')
  assert.equal(formatFixed(null, 1), '—')
  assert.equal(formatFixed(NaN, 1), '—')
})

test('recordAmount：記帳金額照實付幣別的小數位數（日圓整數、美元到分）', () => {
  assert.equal(recordAmount(11749.73, 'JPY'), 11750)
  assert.equal(recordAmount(80.456, 'USD'), 80.46)
})

test('isCustomPair：正向或反向有自訂匯率才算，同幣別與沒設定不算', () => {
  const custom = { JPY_TWD: 0.25 }
  assert.equal(isCustomPair(custom, 'JPY', 'TWD'), true)
  assert.equal(isCustomPair(custom, 'TWD', 'JPY'), true)
  assert.equal(isCustomPair(custom, 'JPY', 'USD'), false)
  assert.equal(isCustomPair(custom, 'JPY', 'JPY'), false)
  assert.equal(isCustomPair({}, 'JPY', 'TWD'), false)
  assert.equal(isCustomPair(undefined, 'JPY', 'TWD'), false)
  assert.equal(isCustomPair({ JPY_TWD: 0 }, 'JPY', 'TWD'), false) // 與 pairRate 一致：0 無效
})
