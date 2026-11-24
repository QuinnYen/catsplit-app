import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeEntryAmounts, roundMoney, addMoney } from './money.js'

test('roundMoney／addMoney 去掉浮點雜訊', () => {
  assert.equal(addMoney(0.1, 0.2), 0.3)
  assert.equal(roundMoney(1.0000000001), 1)
})

test('幣別與統計幣別相同：匯率 1、統計金額等於金額', () => {
  assert.deepEqual(
    computeEntryAmounts({ amount: 980, currency: 'JPY', baseCurrency: 'JPY' }),
    { amount: 980, exchangeRate: 1, baseAmount: 980 },
  )
})

test('外幣換成統計幣別，依統計幣別的小數位取整', () => {
  const r = computeEntryAmounts({ amount: 3050, currency: 'TWD', baseCurrency: 'JPY', rate: 4.76 })
  assert.deepEqual(r, { amount: 3050, exchangeRate: 4.76, baseAmount: 14518 })
  const usd = computeEntryAmounts({ amount: 250, currency: 'USD', baseCurrency: 'TWD', rate: 31.5 })
  assert.equal(usd.baseAmount, 7875)
})

test('金額依帳目幣別取整（日圓沒有小數）', () => {
  assert.equal(computeEntryAmounts({ amount: 100.6, currency: 'JPY', baseCurrency: 'JPY' }).amount, 101)
  assert.equal(computeEntryAmounts({ amount: 10.456, currency: 'USD', baseCurrency: 'USD' }).amount, 10.46)
})

test('幣別與統計幣別不同但沒有匯率：丟出錯誤', () => {
  assert.throws(() => computeEntryAmounts({ amount: 100, currency: 'USD', baseCurrency: 'TWD' }), /rate/)
  assert.throws(() => computeEntryAmounts({ amount: 100, currency: 'USD', baseCurrency: 'TWD', rate: 0 }), /rate/)
})

test('金額必須為正，取整成 0 也不行', () => {
  assert.throws(() => computeEntryAmounts({ amount: 0, currency: 'TWD', baseCurrency: 'TWD' }), /positive/)
  assert.throws(() => computeEntryAmounts({ amount: -5, currency: 'TWD', baseCurrency: 'TWD' }), /positive/)
  assert.throws(() => computeEntryAmounts({ amount: 0.4, currency: 'TWD', baseCurrency: 'TWD' }), /positive/)
})

test('統計金額取整成 0 時丟出錯誤', () => {
  assert.throws(() => computeEntryAmounts({ amount: 1, currency: 'JPY', baseCurrency: 'TWD', rate: 0.21 }), /zero/)
})

test('帳戶幣別與帳目幣別相同：沒有扣款金額欄位', () => {
  const r = computeEntryAmounts({ amount: 980, currency: 'JPY', baseCurrency: 'JPY', accountCurrency: 'JPY' })
  assert.equal('accountAmount' in r, false)
  assert.equal('accountRate' in r, false)
})

test('跨幣別帳目：扣款金額由匯率估算', () => {
  const r = computeEntryAmounts({ amount: 14500, currency: 'JPY', baseCurrency: 'JPY', accountCurrency: 'TWD', accountRate: 0.21 })
  assert.deepEqual(r, { amount: 14500, exchangeRate: 1, baseAmount: 14500, accountAmount: 3045, accountRate: 0.21 })
})

test('跨幣別帳目：手動覆寫實際扣款金額', () => {
  const r = computeEntryAmounts({ amount: 14500, currency: 'JPY', baseCurrency: 'JPY', accountCurrency: 'TWD', accountRate: 0.21, accountAmount: 3050 })
  assert.equal(r.accountAmount, 3050)
  assert.equal(r.accountRate, 0.21)
  // 只給實際扣款金額時，由它反推匯率
  const only = computeEntryAmounts({ amount: 14500, currency: 'JPY', baseCurrency: 'JPY', accountCurrency: 'TWD', accountAmount: 3050 })
  assert.equal(only.accountAmount, 3050)
  assert.ok(Math.abs(only.accountRate - 3050 / 14500) < 1e-12)
})

test('跨幣別帳目：沒有扣款匯率也沒有扣款金額時丟出錯誤', () => {
  assert.throws(() => computeEntryAmounts({ amount: 100, currency: 'JPY', baseCurrency: 'JPY', accountCurrency: 'TWD' }), /account/)
})
