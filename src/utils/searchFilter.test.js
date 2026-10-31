import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_FILTERS, isFiltering, dateBounds, applyFilters } from './searchFilter.js'

const at = (y, m, d) => ({ toDate: () => new Date(y, m - 1, d, 12) })
const profiles = { me: { name: '小明' }, u2: { name: '小華' } }
const ctx = { uid: 'me', memberProfiles: profiles, baseCurrency: 'TWD', categoryLabelOf: (c) => ({ food: '餐飲', transport: '交通' }[c] ?? c), now: new Date(2026, 10, 15) }

const items = [
  { id: 'e1', _type: 'expense', title: '拉麵', category: 'food', payments: { me: 300 }, splits: { me: 150, u2: 150 }, amount: 300, createdAt: at(2026, 11, 3) },
  { id: 'e2', _type: 'expense', title: '計程車', category: 'transport', note: '機場', payments: { u2: 100 }, splits: { u2: 100 }, amount: 100, currency: 'JPY', createdAt: at(2026, 10, 20) },
  { id: 'i1', _type: 'income', title: '退款', category: 'refund', received: { u2: 50 }, splits: { me: 25, u2: 25 }, amount: 50, createdAt: at(2025, 12, 31) },
  { id: 's1', _type: 'settlement', from: 'u2', to: 'me', amount: 80, note: '現金', createdAt: at(2026, 11, 10) },
]
const ids = (f) => applyFilters(items, { ...EMPTY_FILTERS, ...f }, ctx).map(i => i.id)

test('沒有條件時 isFiltering 為 false、原樣回傳', () => {
  assert.equal(isFiltering(EMPTY_FILTERS), false)
  assert.deepEqual(ids({}), ['e1', 'e2', 'i1', 's1'])
  assert.equal(isFiltering({ ...EMPTY_FILTERS, text: '  ' }), false)
})

test('日期：這個月、上個月、今年、去年', () => {
  assert.deepEqual(ids({ range: 'thisMonth' }), ['e1', 's1'])
  assert.deepEqual(ids({ range: 'lastMonth' }), ['e2'])
  assert.deepEqual(ids({ range: 'thisYear' }), ['e1', 'e2', 's1'])
  assert.deepEqual(ids({ range: 'lastYear' }), ['i1'])
})

test('日期：自訂區間含起訖日、可只填一邊、顛倒會自動對調', () => {
  assert.deepEqual(ids({ range: 'custom', from: '2026-11-03', to: '2026-11-10' }), ['e1', 's1'])
  assert.deepEqual(ids({ range: 'custom', from: '2026-11-04' }), ['s1'])
  assert.deepEqual(ids({ range: 'custom', from: '2026-11-10', to: '2026-11-03' }), ['e1', 's1'])
  assert.equal(dateBounds({ ...EMPTY_FILTERS, range: 'custom' }), null)
})

test('類型、類別（轉帳沒有類別）、貨幣', () => {
  assert.deepEqual(ids({ type: 'income' }), ['i1'])
  assert.deepEqual(ids({ category: 'food' }), ['e1'])
  assert.deepEqual(ids({ currency: 'JPY' }), ['e2'])
  assert.deepEqual(ids({ currency: 'TWD' }), ['e1', 'i1', 's1'])
})

test('只與我相關：我付款、我有分攤、我是轉帳的一方', () => {
  assert.deepEqual(ids({ mine: true }), ['e1', 'i1', 's1'])
})

test('文字：比對標題、備註、類別顯示文字、付款人；收入與轉帳也能搜', () => {
  assert.deepEqual(ids({ text: '機場' }), ['e2'])
  assert.deepEqual(ids({ text: '交通' }), ['e2'])
  assert.deepEqual(ids({ text: '小華' }), ['e2', 'i1', 's1'])
  assert.deepEqual(ids({ text: '現金' }), ['s1'])
})

test('多個條件取交集', () => {
  assert.deepEqual(ids({ range: 'thisYear', mine: true, type: 'expense' }), ['e1'])
})
