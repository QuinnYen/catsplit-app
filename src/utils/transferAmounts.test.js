import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTransferAmounts } from './transferAmounts.js'

const base = { baseSuggested: 10000, currency: 'JPY', baseCurrency: 'JPY', rateToCurrency: 1, customAmount: null }

test('基準幣：沿用建議金額，餘額金額相同', () => {
  const r = computeTransferAmounts(base)
  assert.deepEqual(r, { ready: true, suggested: 10000, actual: 10000, baseAmount: 10000, rate: 1 })
})

test('基準幣：手動改金額就用輸入值', () => {
  const r = computeTransferAmounts({ ...base, customAmount: '8000' })
  assert.equal(r.actual, 8000)
  assert.equal(r.baseAmount, 8000)
})

test('外幣：建議金額換算並依幣別取整，沒改時餘額用精確的基準幣值', () => {
  const r = computeTransferAmounts({ ...base, currency: 'TWD', rateToCurrency: 0.2059 })
  assert.equal(r.suggested, 2059)
  assert.equal(r.actual, 2059)
  assert.equal(r.baseAmount, 10000)
  assert.ok(Math.abs(r.rate - 1 / 0.2059) < 1e-9)
})

test('外幣：改了金額，餘額金額 = 輸入值 × 匯率（兩位小數）', () => {
  const r = computeTransferAmounts({ ...base, currency: 'TWD', rateToCurrency: 0.2 , customAmount: '1000' })
  assert.equal(r.baseAmount, 5000)
})

test('外幣：匯率還沒抓到不算 ready，不產生金額', () => {
  const r = computeTransferAmounts({ ...base, currency: 'TWD', rateToCurrency: null })
  assert.equal(r.ready, false)
  assert.equal(r.baseAmount, 0)
})

test('美元基準幣轉日圓：依日圓整數取整', () => {
  const r = computeTransferAmounts({ baseSuggested: 12.5, currency: 'JPY', baseCurrency: 'USD', rateToCurrency: 150, customAmount: null })
  assert.equal(r.suggested, 1875)
  assert.equal(r.baseAmount, 12.5)
})
