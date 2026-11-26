import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatExpr, sanitizeRows, validCode, pairRate, convertRows, computePay, roundTo, formatFixed, recordAmount, adjustRates, customRateOf, usesCustom, DEFAULT_FX_SETTINGS } from './fxMath.js'

// 以 USD 為 1 的匯率表（數字是為了好算，不是真實匯率）
const rates = { USD: 1, JPY: 160, TWD: 32, CNY: 7.2 }

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)

test('預設設定：截圖的預設值', () => {
  assert.deepEqual(DEFAULT_FX_SETTINGS, { rows: ['TWD', 'JPY', 'USD'], decimals: 1, defaultAmount: 1, showSymbol: true, taxFreePercent: 10, cardFeePercent: 1.5, serviceFeePercent: 10, addTaxPercent: 8, tipPercent: 15, customShortcuts: [], customRates: {} })
})

test('預設換算列是台幣、日圓、美元', () => {
  assert.deepEqual(DEFAULT_FX_SETTINGS.rows, ['TWD', 'JPY', 'USD'])
})

test('computePay：實付幣別就是輸入的幣別時不用匯率，免稅與刷卡直接算在那個幣別上', () => {
  const r = computePay({ amount: 1000, from: 'JPY', pay: 'JPY', rates: null, taxFree: true, taxPercent: 10, card: true, cardPercent: 1.5 })
  close(r.afterTax, 1000 / 1.1)
  close(r.total, (1000 / 1.1) * 1.015)
})

test('formatExpr：整數部分加千分位，小數與運算符號不動', () => {
  assert.equal(formatExpr('1000'), '1,000')
  assert.equal(formatExpr('1234567.891'), '1,234,567.891')
  assert.equal(formatExpr('1000+2500.'), '1,000+2,500.')
  assert.equal(formatExpr('12×3.5−1000'), '12×3.5−1,000')
  assert.equal(formatExpr(''), '')
  assert.equal(formatExpr('0.'), '0.')
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
  assert.equal(pairRate(rates, 'JPY', 'JPY'), 1)
  close(pairRate(rates, 'JPY', 'TWD'), 0.2) // 1 JPY = 32/160 TWD
  close(pairRate(rates, 'USD', 'JPY'), 160)
  close(pairRate(rates, 'TWD', 'JPY'), 5)
  assert.equal(pairRate(rates, 'JPY', 'KRW'), null)
  assert.equal(pairRate({}, 'JPY', 'TWD'), null)
  assert.equal(pairRate(undefined, 'JPY', 'TWD'), null)
})

test('customRateOf：正向、反向取倒數、基準幣自己與無效值回 null', () => {
  assert.equal(customRateOf({ JPY_TWD: 0.25 }, 'JPY', 'TWD'), 0.25)
  assert.equal(customRateOf({ TWD_JPY: 4 }, 'JPY', 'TWD'), 0.25) // 反向的鍵取倒數
  assert.equal(customRateOf({ JPY_TWD: 0.25, TWD_JPY: 5 }, 'JPY', 'TWD'), 0.25) // 兩個都有以正向為準
  assert.equal(customRateOf({ JPY_TWD: 0.25 }, 'TWD', 'TWD'), null)
  assert.equal(customRateOf({ JPY_TWD: 0 }, 'JPY', 'TWD'), null)
  assert.equal(customRateOf({ JPY_USD: 0.01 }, 'JPY', 'TWD'), null) // 不是對基準幣的項目不算
  assert.equal(customRateOf(undefined, 'JPY', 'TWD'), null)
})

test('adjustRates：把自訂匯率套進匯率表，任兩種幣別的換算一致', () => {
  const adj = adjustRates(rates, { JPY_TWD: 0.25 }, 'TWD')
  close(pairRate(adj, 'JPY', 'TWD'), 0.25) // 自訂的
  close(pairRate(adj, 'TWD', 'JPY'), 4)
  // 自訂的 JPY 與市場的 USD 互換：1 JPY = 0.25 TWD = 0.25/32 USD，不是市場的 1/160
  close(pairRate(adj, 'JPY', 'USD'), 0.25 / 32)
  close(pairRate(adj, 'USD', 'JPY'), 32 / 0.25)
  close(pairRate(adj, 'USD', 'TWD'), 32) // 沒設自訂的照市場
  close(pairRate(adj, 'USD', 'CNY'), 7.2)
  assert.equal(rates.JPY, 160) // 不改動傳入的匯率表
})

test('adjustRates：沒有自訂、缺基準幣、非基準幣的舊資料不套用', () => {
  assert.deepEqual(adjustRates(rates, {}, 'TWD'), rates)
  assert.deepEqual(adjustRates(rates, { JPY_TWD: 0.25 }, 'KRW'), rates) // 基準幣不在表裡
  assert.deepEqual(adjustRates(rates, { JPY_USD: 0.01 }, 'TWD'), rates) // 早期版本可設的任意組合，現在不套用
  close(pairRate(adjustRates(rates, { TWD_JPY: 5 }, 'TWD'), 'JPY', 'TWD'), 0.2) // 反向 5 → 1 JPY = 0.2 TWD
})

test('usesCustom：任何一邊（不是基準幣）有自訂就算，同幣別與沒設定不算', () => {
  const custom = { JPY_TWD: 0.25 }
  assert.equal(usesCustom(custom, 'TWD', 'JPY', 'TWD'), true)
  assert.equal(usesCustom(custom, 'TWD', 'TWD', 'JPY'), true)
  assert.equal(usesCustom(custom, 'TWD', 'JPY', 'USD'), true) // 自訂的 JPY 影響它和 USD 的換算
  assert.equal(usesCustom(custom, 'TWD', 'USD', 'CNY'), false)
  assert.equal(usesCustom(custom, 'TWD', 'JPY', 'JPY'), false)
  assert.equal(usesCustom({}, 'TWD', 'JPY', 'TWD'), false)
  assert.equal(usesCustom(undefined, 'TWD', 'JPY', 'TWD'), false)
})

test('convertRows：每一列換算，缺匯率的列是 null，沒有金額全部 null', () => {
  const r = convertRows({ value: 1000, from: 'JPY', codes: ['JPY', 'TWD', 'KRW'], rates })
  assert.equal(r.JPY, 1000)
  close(r.TWD, 200)
  assert.equal(r.KRW, null)
  assert.deepEqual(convertRows({ value: null, from: 'JPY', codes: ['JPY', 'TWD'], rates }), { JPY: null, TWD: null })
})

test('computePay：免稅是除以 1.1、刷卡加在免稅後（截圖 4 的數字）', () => {
  // 截圖：換算結果 ¥12,733.7，免稅 −¥1,157.6，刷卡 +¥173.6，實付 ¥11,749.8
  const r = computePay({ amount: 12733.7, from: 'JPY', pay: 'JPY', rates, taxFree: true, taxPercent: 10, card: true, cardPercent: 1.5 })
  assert.equal(roundTo(r.taxDeduct, 1), 1157.6)
  assert.equal(roundTo(r.afterTax, 1), 11576.1)
  assert.equal(roundTo(r.fee, 1), 173.6)
  assert.equal(roundTo(r.total, 1), 11749.7) // 截圖的 .8 是畫面金額已四捨五入造成的 0.1 差
  assert.notEqual(roundTo(12733.7 * 0.9, 1), roundTo(r.afterTax, 1)) // 不是乘 0.9
})

test('computePay：只開其中一個、都不開、先換成實付幣別、缺匯率', () => {
  const only = (o) => computePay({ amount: 1100, from: 'JPY', pay: 'JPY', rates, taxFree: false, taxPercent: 10, card: false, cardPercent: 1.5, ...o })
  close(only({ taxFree: true }).total, 1000)
  close(only({ card: true }).total, 1116.5)
  assert.equal(only({}).total, 1100)
  assert.deepEqual(only({}), { gross: 1100, taxDeduct: 0, afterTax: 1100, lines: [], subtotal: 1100, fee: 0, total: 1100 })
  // 80 USD → 以 JPY 實付：80 × 160 = 12800
  close(computePay({ amount: 80, from: 'USD', pay: 'JPY', rates, taxFree: false, taxPercent: 10, card: false, cardPercent: 1.5 }).total, 12800)
  assert.equal(computePay({ amount: 80, from: 'USD', pay: 'KRW', rates, taxFree: false, taxPercent: 10, card: false, cardPercent: 1.5 }), null)
  assert.equal(computePay({ amount: null, from: 'USD', pay: 'JPY', rates, taxFree: false, taxPercent: 10, card: false, cardPercent: 1.5 }), null)
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
