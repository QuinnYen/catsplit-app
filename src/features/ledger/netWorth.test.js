import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeNetWorth, netWorthCurrencies } from './netWorth.js'

const accounts = [
  { id: 'cash', kind: 'normal', currency: 'TWD', balance: 1000 },
  { id: 'jp', kind: 'normal', currency: 'JPY', balance: 10000 },
  { id: 'snap_g', kind: 'group', currency: 'TWD', balance: 0, syncedNet: -999 },
]

test('computeNetWorth：外幣依匯率換算，快照帳戶不計入', () => {
  const r = computeNetWorth({ accounts, baseCurrency: 'TWD', rates: { JPY: 0.21 } })
  assert.deepEqual(r, { total: 3100, estimated: true, missing: [] })
})

test('computeNetWorth：缺匯率的外幣不計入並回報', () => {
  const r = computeNetWorth({ accounts, baseCurrency: 'TWD', rates: {} })
  assert.deepEqual(r, { total: 1000, estimated: true, missing: ['JPY'] })
})

test('computeNetWorth：只有統計幣別帳戶時不是估算；負餘額（信用卡）會扣掉', () => {
  const r = computeNetWorth({ accounts: [{ id: 'a', kind: 'normal', currency: 'TWD', balance: 500 }, { id: 'c', kind: 'normal', currency: 'TWD', balance: -200 }], baseCurrency: 'TWD' })
  assert.deepEqual(r, { total: 300, estimated: false, missing: [] })
})

test('netWorthCurrencies：需要匯率的外幣，去重且不含快照帳戶', () => {
  assert.deepEqual(netWorthCurrencies([...accounts, { id: 'x', kind: 'normal', currency: 'JPY' }, { id: 'snap', kind: 'group', currency: 'USD' }], 'TWD'), ['JPY'])
})
