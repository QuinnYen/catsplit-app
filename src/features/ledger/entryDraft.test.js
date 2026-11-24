import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTransactionData, draftFromTransaction, isValidDate, entryHeadline } from './entryDraft.js'

const accounts = [
  { id: 'jcash', currency: 'JPY', kind: 'normal' },
  { id: 'jcard', currency: 'TWD', kind: 'normal' },
  { id: 'snap_g1', currency: 'JPY', kind: 'group' },
]
const base = { ledgerBaseCurrency: 'JPY', accounts }
const draft = (o = {}) => ({ kind: 'expense', amount: 980, date: '2026-11-24', accountId: 'jcash', category: 'food', ...o })
const build = (o, extra = {}) => buildTransactionData({ ...base, ...extra, draft: draft(o) })

test('isValidDate：格式與真實日期', () => {
  assert.equal(isValidDate('2026-11-24'), true)
  assert.equal(isValidDate('2026-02-29'), false)
  assert.equal(isValidDate('2024-02-29'), true)
  assert.equal(isValidDate('2026-13-01'), false)
  assert.equal(isValidDate('2026-1-1'), false)
  assert.equal(isValidDate(''), false)
  assert.equal(isValidDate(undefined), false)
})

test('支出：幣別等於帳戶與統計幣別，不帶扣款金額，備註沒填就不存', () => {
  const r = build()
  assert.equal(r.ok, true)
  assert.deepEqual(r.data, {
    type: 'expense', accountId: 'jcash', currency: 'JPY', amount: 980, exchangeRate: 1, baseAmount: 980,
    category: 'food', date: '2026-11-24', source: { type: 'manual' },
  })
})

test('備註去頭尾空白、最長 50 字，有備註才存', () => {
  assert.equal(build({ note: '  午餐  ' }).data.note, '午餐')
  assert.equal(build({ note: 'a'.repeat(80) }).data.note.length, 50)
  assert.equal('note' in build({ note: '   ' }).data, false)
})

test('跨幣別：台幣帳戶記日圓消費，帶統計匯率與扣款金額', () => {
  const r = build({ accountId: 'jcard', currency: 'JPY', amount: 14500, accountRate: 0.21 })
  assert.equal(r.ok, true)
  assert.deepEqual(r.data, {
    type: 'expense', accountId: 'jcard', currency: 'JPY', amount: 14500, exchangeRate: 1, baseAmount: 14500,
    accountAmount: 3045, accountRate: 0.21, category: 'food', date: '2026-11-24', source: { type: 'manual' },
  })
})

test('跨幣別：可手動覆寫實際扣款金額', () => {
  const r = build({ accountId: 'jcard', currency: 'JPY', amount: 14500, accountRate: 0.21, accountAmount: '3050' })
  assert.equal(r.data.accountAmount, 3050)
})

test('外幣換成統計幣別要有匯率；跨幣別扣款要有扣款匯率或扣款金額', () => {
  assert.deepEqual(build({ currency: 'USD', amount: 10 }), { ok: false, reason: 'baseRate' })
  assert.deepEqual(build({ currency: 'USD', amount: 10, baseRate: 150 }), { ok: false, reason: 'accountRate' }) // 日圓帳戶記美元，也要扣款匯率
  assert.equal(build({ currency: 'USD', amount: 10, baseRate: 150, accountRate: 150 }).data.baseAmount, 1500)
  assert.deepEqual(build({ accountId: 'jcard', currency: 'JPY' }), { ok: false, reason: 'accountRate' })
  assert.equal(build({ accountId: 'jcard', currency: 'JPY', accountAmount: 3000 }).ok, true)
})

test('收入：種類與分類', () => {
  const r = build({ kind: 'income', category: 'salary', amount: 42000 })
  assert.equal(r.data.type, 'income')
  assert.equal(r.data.category, 'salary')
})

test('驗證：金額、日期、帳戶、分類', () => {
  assert.deepEqual(build({ amount: 0 }), { ok: false, reason: 'amount' })
  assert.deepEqual(build({ amount: '' }), { ok: false, reason: 'amount' })
  assert.deepEqual(build({ amount: -5 }), { ok: false, reason: 'amount' })
  assert.deepEqual(build({ amount: NaN }), { ok: false, reason: 'amount' })
  assert.deepEqual(build({ date: '2026-02-30' }), { ok: false, reason: 'date' })
  assert.deepEqual(build({ accountId: 'nope' }), { ok: false, reason: 'account' })
  assert.deepEqual(build({ category: '' }), { ok: false, reason: 'category' })
  assert.deepEqual(build({ category: '   ' }), { ok: false, reason: 'category' })
  assert.deepEqual(build({ kind: 'weird' }), { ok: false, reason: 'amount' })
})

test('快照帳戶不能手動記帳', () => {
  assert.deepEqual(build({ accountId: 'snap_g1' }), { ok: false, reason: 'account' })
  assert.deepEqual(build({ kind: 'transfer', accountId: 'jcash', toAccountId: 'snap_g1' }), { ok: false, reason: 'account' })
})

test('轉帳：同幣別轉入金額等於轉出金額，不帶分類與匯率欄位', () => {
  const same = [{ id: 'a', currency: 'TWD', kind: 'normal' }, { id: 'b', currency: 'TWD', kind: 'normal' }]
  const r = buildTransactionData({ ledgerBaseCurrency: 'TWD', accounts: same, draft: { kind: 'transfer', amount: 2000, date: '2026-11-24', accountId: 'a', toAccountId: 'b' } })
  assert.deepEqual(r.data, { type: 'transfer', accountId: 'a', toAccountId: 'b', amount: 2000, currency: 'TWD', toAmount: 2000, date: '2026-11-24', source: { type: 'manual' } })
})

test('轉帳：跨幣別用轉入金額，或由匯率算；都沒有就缺匯率', () => {
  const t = (o) => build({ kind: 'transfer', accountId: 'jcard', toAccountId: 'jcash', amount: 4200, ...o })
  assert.equal(t({ toAmount: '20000' }).data.toAmount, 20000)
  assert.equal(t({ transferRate: 4.76 }).data.toAmount, 19992)
  assert.deepEqual(t({}), { ok: false, reason: 'transferRate' })
  assert.equal(t({ toAmount: 20000 }).data.currency, 'TWD') // 幣別是轉出帳戶的
})

test('轉帳：轉出與轉入不能是同一個帳戶', () => {
  assert.deepEqual(build({ kind: 'transfer', accountId: 'jcash', toAccountId: 'jcash' }), { ok: false, reason: 'sameAccount' })
})

test('來源 fx：匯率換算頁帶入的帳目', () => {
  assert.deepEqual(build({ sourceType: 'fx' }).data.source, { type: 'fx' })
  assert.deepEqual(build({ sourceType: 'other' }).data.source, { type: 'manual' })
})

test('draftFromTransaction：還原成面板草稿', () => {
  const tx = { type: 'expense', amount: 14500, currency: 'JPY', accountId: 'jcard', accountAmount: 3050, category: 'food', note: '拉麵', date: '2026-11-24', source: { type: 'manual' } }
  assert.deepEqual(draftFromTransaction(tx), {
    kind: 'expense', expr: '14500', currency: 'JPY', accountId: 'jcard', toAccountId: '', category: 'food', note: '拉麵',
    date: '2026-11-24', accountAmount: '3050', toAmount: '', sourceType: 'manual',
  })
  const tr = draftFromTransaction({ type: 'transfer', amount: 4200, currency: 'TWD', accountId: 'a', toAccountId: 'b', toAmount: 20000, date: '2026-11-23', source: { type: 'fx' } })
  assert.equal(tr.toAmount, '20000')
  assert.equal(tr.sourceType, 'fx')
})

test('編輯後再存回來的資料與原本一致（往返）', () => {
  const r = build({ accountId: 'jcard', currency: 'JPY', amount: 14500, accountRate: 0.21, note: '拉麵' })
  const d = draftFromTransaction(r.data)
  const again = buildTransactionData({
    ledgerBaseCurrency: 'JPY', accounts,
    draft: { ...d, amount: parseFloat(d.expr), accountRate: r.data.accountRate, accountAmount: d.accountAmount },
  })
  assert.deepEqual(again.data, r.data)
})

test('entryHeadline：標題 > 備註 > 分類', () => {
  const label = (c) => `L:${c}`
  assert.equal(entryHeadline({ title: '晚餐', note: 'x', category: 'food' }, label), '晚餐')
  assert.equal(entryHeadline({ note: '拉麵', category: 'food' }, label), '拉麵')
  assert.equal(entryHeadline({ category: 'food' }, label), 'L:food')
})
