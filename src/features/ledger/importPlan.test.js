import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planImport } from './importPlan.js'

const group = (itemId, kind = 'expense', extra = {}) => ({ type: 'group', groupId: 'g1', kind, itemId, ...extra })
const row = (id, o = {}) => ({ id, type: 'expense', accountId: 'snap_g1', amount: 3000, currency: 'JPY', exchangeRate: 1, baseAmount: 3000, source: group(id), ...o })

test('幣別相同：只改帳戶與 detached，不產生扣款金額', () => {
  const r = planImport({ rows: [row('a'), row('b', { type: 'income', amount: 800, baseAmount: 800, source: group('b', 'income') })], target: { id: 'jcash', currency: 'JPY' } })
  assert.deepEqual(r.updates, [
    { id: 'a', data: { accountId: 'jcash', source: { ...group('a'), detached: true } } },
    { id: 'b', data: { accountId: 'jcash', source: { ...group('b', 'income'), detached: true } } },
  ])
  assert.equal(r.balanceDelta, -2200) // −3000 + 800
  assert.deepEqual(r.snapshotDelta, { count: -2, net: 2200 })
  assert.deepEqual(r.missingRates, [])
})

test('跨幣別：用匯率算扣款金額並記下匯率，餘額增量以目標帳戶幣別計', () => {
  const r = planImport({ rows: [row('a')], target: { id: 'jcard', currency: 'TWD' }, rates: { JPY: 0.21 } })
  assert.deepEqual(r.updates[0].data, { accountId: 'jcard', source: { ...group('a'), detached: true }, accountAmount: 630, accountRate: 0.21 })
  assert.equal(r.balanceDelta, -630)
  assert.deepEqual(r.snapshotDelta, { count: -1, net: 3000 })
})

test('缺匯率：該幣別的帳目不匯入，並回報缺哪些幣別', () => {
  const r = planImport({
    rows: [row('a'), row('b', { currency: 'USD', amount: 20 }), row('c', { currency: 'EUR', amount: 10 })],
    target: { id: 'jcard', currency: 'TWD' },
    rates: { JPY: 0.21 },
  })
  assert.deepEqual(r.updates.map((u) => u.id), ['a'])
  assert.deepEqual(r.missingRates.sort(), ['EUR', 'USD'])
  assert.equal(r.balanceDelta, -630)
})

test('匯率無效（0、負數）視同缺匯率', () => {
  const r = planImport({ rows: [row('a')], target: { id: 'x', currency: 'TWD' }, rates: { JPY: 0 } })
  assert.deepEqual(r.updates, [])
  assert.deepEqual(r.missingRates, ['JPY'])
})

test('換算後取整成 0 視同缺匯率（不會寫入無效金額）', () => {
  const r = planImport({ rows: [row('a', { amount: 1 })], target: { id: 'x', currency: 'TWD' }, rates: { JPY: 0.21 } })
  assert.deepEqual(r.updates, [])
  assert.deepEqual(r.missingRates, ['JPY'])
})

test('非快照帳目（手動、已匯入）會被略過；重複匯入沒有任何更新', () => {
  const imported = row('a', { accountId: 'jcash', source: { ...group('a'), detached: true } })
  const manual = row('m', { source: { type: 'manual' } })
  const r = planImport({ rows: [imported, manual], target: { id: 'jcash', currency: 'JPY' } })
  assert.deepEqual(r.updates, [])
  assert.equal(r.balanceDelta, 0)
  assert.deepEqual(r.snapshotDelta, { count: 0, net: 0 })
})

test('保留 source 上使用者改過的標記', () => {
  const r = planImport({ rows: [row('a', { source: group('a', 'expense', { edited: { category: true } }) })], target: { id: 'jcash', currency: 'JPY' } })
  assert.deepEqual(r.updates[0].data.source, { ...group('a'), edited: { category: true }, detached: true })
})

test('沒有帳目時回傳空計畫', () => {
  const r = planImport({ rows: [], target: { id: 'x', currency: 'TWD' } })
  assert.deepEqual(r, { updates: [], balanceDelta: 0, snapshotDelta: { count: 0, net: 0 }, missingRates: [] })
})
