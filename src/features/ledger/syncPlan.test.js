import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planGroupSync, toMillis, toDateString, mapIncomeCategory } from './syncPlan.js'

// 本機時間 2026-11-d 中午，避免時區造成日期跨日
const ms = (d) => new Date(2026, 10, d, 12).getTime()
const NOW = 'now-placeholder'

// 群組基準幣 TWD、日圓消費：原幣 12000 JPY = 2520 TWD，我分攤 630 TWD（= 3000 JPY）
const expense = (id, o = {}) => ({
  id, title: '晚餐', category: 'food', currency: 'JPY', originalAmount: 12000, exchangeRate: 0.21,
  amount: 2520, splits: { u1: 630, u2: 1890 }, createdAt: ms(23), ...o,
})
const income = (id, o = {}) => ({
  id, title: '退款', category: 'refund', currency: 'TWD', originalAmount: 800, exchangeRate: 1,
  amount: 800, splits: { u1: 400, u2: 400 }, createdAt: ms(22), ...o,
})
const base = {
  uid: 'u1', groupId: 'g1', linkedAt: ms(20), groupBaseCurrency: 'TWD', ledgerBaseCurrency: 'JPY',
  groupToLedgerRate: 1 / 0.21, now: NOW,
}
const plan = (o) => planGroupSync({ ...base, ...o })

test('每筆群組帳目產生一筆快照帳目：原幣份額、固定 id、快照帳戶', () => {
  const r = plan({ expenses: [expense('e1')] })
  assert.equal(r.upserts.length, 1)
  const { id, data } = r.upserts[0]
  assert.equal(id, 'g_g1_e_e1')
  assert.deepEqual(data, {
    type: 'expense', accountId: 'snap_g1', amount: 3000, currency: 'JPY', exchangeRate: 1, baseAmount: 3000,
    title: '晚餐', category: 'food', note: '', date: '2026-11-23',
    source: { type: 'group', groupId: 'g1', kind: 'expense', itemId: 'e1' }, createdAt: NOW,
  })
  assert.deepEqual(r.snapshot, { count: 1, net: -3000 })
  assert.deepEqual(r.deletes, [])
  assert.deepEqual(r.pending, [])
})

test('群組基準幣等於統計幣別：統計金額就是分攤，匯率由原幣份額反推', () => {
  const r = plan({ ledgerBaseCurrency: 'TWD', expenses: [expense('e1')] })
  const d = r.upserts[0].data
  assert.equal(d.amount, 3000) // 日圓原幣份額
  assert.equal(d.currency, 'JPY')
  assert.equal(d.baseAmount, 630)
  assert.equal(d.exchangeRate, 0.21)
})

test('帳目幣別就是群組基準幣：金額等於分攤、匯率 1', () => {
  const e = expense('e1', { currency: 'TWD', originalAmount: 2520, exchangeRate: 1 })
  const d = plan({ ledgerBaseCurrency: 'TWD', expenses: [e] }).upserts[0].data
  assert.equal(d.amount, 630)
  assert.equal(d.currency, 'TWD')
  assert.equal(d.exchangeRate, 1)
})

test('帳目的 homeCurrency 剛好是統計幣別：用 homeRate，不需要另外的匯率', () => {
  const e = expense('e1', { homeCurrency: 'JPY', homeRate: 4.7619 })
  const r = plan({ groupToLedgerRate: undefined, expenses: [e] })
  assert.equal(r.upserts[0].data.baseAmount, 3000)
  assert.deepEqual(r.pending, [])
})

test('需要匯率但沒提供：列入 pending，不產生也不刪除', () => {
  const r = plan({ groupToLedgerRate: undefined, expenses: [expense('e1')] })
  assert.deepEqual(r.upserts, [])
  assert.deepEqual(r.pending, ['g_g1_e_e1'])
  assert.deepEqual(r.deletes, [])
  // 既有的快照帳目遇到 pending 也要保留
  const old = { id: 'g_g1_e_e1', ...plan({ expenses: [expense('e1')] }).upserts[0].data }
  const r2 = plan({ groupToLedgerRate: undefined, expenses: [expense('e1', { splits: { u1: 700 } })], existing: [old] })
  assert.deepEqual(r2.pending, ['g_g1_e_e1'])
  assert.deepEqual(r2.deletes, [])
  assert.equal(r2.snapshot.count, 1)
})

test('只同步消費時間在連結之後的帳目（連結當下算在內）', () => {
  const r = plan({ expenses: [expense('old', { createdAt: ms(19) }), expense('same', { createdAt: ms(20) }), expense('new', { createdAt: ms(21) })] })
  assert.deepEqual(r.upserts.map((u) => u.id).sort(), ['g_g1_e_new', 'g_g1_e_same'])
})

test('分攤為 0、沒有我的份額、金額異常的帳目不產生', () => {
  const r = plan({ expenses: [expense('a', { splits: { u1: 0, u2: 2520 } }), expense('b', { splits: { u2: 2520 } }), expense('c', { amount: 0 }), expense('d', { createdAt: undefined })] })
  assert.deepEqual(r.upserts, [])
})

test('份額四捨五入成 0 的帳目不產生', () => {
  const tiny = expense('e1', { originalAmount: 10, amount: 100, splits: { u1: 1, u2: 99 } }) // 0.1 JPY
  assert.deepEqual(plan({ expenses: [tiny] }).upserts, [])
})

test('收入：取我的份額、贊助不帶、分類對不上的歸其他', () => {
  const r = plan({
    ledgerBaseCurrency: 'TWD',
    incomes: [income('i1'), income('i2', { category: 'subsidy' }), income('i3', { isSponsorship: true }), income('i4', { category: '自訂文字' })],
  })
  assert.deepEqual(r.upserts.map((u) => [u.id, u.data.type, u.data.category]), [
    ['g_g1_i_i1', 'income', 'refund'], ['g_g1_i_i2', 'income', 'other'], ['g_g1_i_i4', 'income', 'other'],
  ])
  assert.deepEqual(r.snapshot, { count: 3, net: 1200 })
})

test('快照淨額 = 收入 − 支出（統計幣別）', () => {
  const r = plan({ ledgerBaseCurrency: 'TWD', expenses: [expense('e1')], incomes: [income('i1')] })
  assert.deepEqual(r.snapshot, { count: 2, net: -230 }) // 400 − 630
})

test('冪等：用上一輪結果當現有帳目，再同步不產生任何寫入', () => {
  const first = plan({ expenses: [expense('e1')], incomes: [income('i1', { currency: 'JPY', originalAmount: 4000, amount: 840, splits: { u1: 420, u2: 420 } })] })
  const existing = first.upserts.map((u) => ({ id: u.id, ...u.data }))
  const second = plan({ expenses: [expense('e1')], incomes: [income('i1', { currency: 'JPY', originalAmount: 4000, amount: 840, splits: { u1: 420, u2: 420 } })], existing })
  assert.deepEqual(second.upserts, [])
  assert.deepEqual(second.deletes, [])
  assert.deepEqual(second.snapshot, first.snapshot)
})

test('份額沒變時匯率凍結：統計用匯率變了也不重算', () => {
  const first = plan({ expenses: [expense('e1')] })
  const existing = [{ id: 'g_g1_e_e1', ...first.upserts[0].data, exchangeRate: 1.01, baseAmount: 3030 }]
  const r = plan({ groupToLedgerRate: 9, expenses: [expense('e1')], existing })
  assert.deepEqual(r.upserts, [])
  assert.equal(r.snapshot.net, -3030)
})

test('份額改變時重算，並保留原本的建立時間', () => {
  const first = plan({ expenses: [expense('e1')] })
  const existing = [{ id: 'g_g1_e_e1', ...first.upserts[0].data, createdAt: 'created-before' }]
  const r = plan({ expenses: [expense('e1', { splits: { u1: 1260, u2: 1260 } })], existing })
  assert.equal(r.upserts.length, 1)
  assert.equal(r.upserts[0].data.amount, 6000)
  assert.equal(r.upserts[0].data.baseAmount, 6000)
  assert.equal(r.upserts[0].data.createdAt, 'created-before')
})

test('來源被刪除：刪除快照帳目', () => {
  const first = plan({ expenses: [expense('e1'), expense('e2')] })
  const existing = first.upserts.map((u) => ({ id: u.id, ...u.data }))
  const r = plan({ expenses: [expense('e2')], existing })
  assert.deepEqual(r.deletes, ['g_g1_e_e1'])
  assert.equal(r.snapshot.count, 1)
})

test('消費日期被改到連結之前：視同刪除', () => {
  const first = plan({ expenses: [expense('e1')] })
  const existing = first.upserts.map((u) => ({ id: u.id, ...u.data }))
  const r = plan({ expenses: [expense('e1', { createdAt: ms(10) })], existing })
  assert.deepEqual(r.deletes, ['g_g1_e_e1'])
})

test('消費日期改到別天：更新日期', () => {
  const first = plan({ expenses: [expense('e1')] })
  const existing = first.upserts.map((u) => ({ id: u.id, ...u.data }))
  const r = plan({ expenses: [expense('e1', { createdAt: ms(25) })], existing })
  assert.equal(r.upserts[0].data.date, '2026-11-25')
})

test('使用者改過的分類與備註不被覆寫，沒改過的欄位照常更新', () => {
  const first = plan({ expenses: [expense('e1', { note: '原備註' })] })
  const row = first.upserts[0].data
  const existing = [{ id: 'g_g1_e_e1', ...row, category: 'daily', note: '我的備註', source: { ...row.source, edited: { category: true, note: true } } }]
  const r = plan({ expenses: [expense('e1', { category: 'shopping', note: '群組新備註', title: '新標題' })], existing })
  assert.equal(r.upserts.length, 1)
  const d = r.upserts[0].data
  assert.equal(d.category, 'daily')
  assert.equal(d.note, '我的備註')
  assert.equal(d.title, '新標題')
  assert.deepEqual(d.source.edited, { category: true, note: true })
  // 只改過分類時，備註仍跟著群組
  const only = [{ id: 'g_g1_e_e1', ...row, category: 'daily', source: { ...row.source, edited: { category: true } } }]
  const r2 = plan({ expenses: [expense('e1', { category: 'shopping', note: '群組新備註' })], existing: only })
  assert.equal(r2.upserts[0].data.category, 'daily')
  assert.equal(r2.upserts[0].data.note, '群組新備註')
})

test('已匯入（detached）的帳目不再同步、不被刪除，也不會被重新產生', () => {
  const first = plan({ expenses: [expense('e1'), expense('e2')] })
  const rows = first.upserts.map((u) => ({ id: u.id, ...u.data }))
  const existing = [{ ...rows[0], accountId: 'a-cash', source: { ...rows[0].source, detached: true } }, rows[1]]
  // e1 已匯入，來源後來被刪除也不影響；e2 還在快照
  const r = plan({ expenses: [expense('e2'), expense('e1', { splits: { u1: 2520 } })], existing })
  assert.deepEqual(r.upserts.map((u) => u.id), [])
  assert.deepEqual(r.deletes, [])
  assert.equal(r.snapshot.count, 1)
  const r2 = plan({ expenses: [expense('e2')], existing })
  assert.deepEqual(r2.deletes, [])
})

test('只處理同一個群組的快照帳目：手動帳目與其他群組的不會被刪', () => {
  const existing = [
    { id: 'manual1', type: 'expense', source: { type: 'manual' } },
    { id: 'g_g2_e_x', type: 'expense', source: { type: 'group', groupId: 'g2', kind: 'expense', itemId: 'x' } },
  ]
  const r = plan({ expenses: [], existing })
  assert.deepEqual(r.deletes, [])
})

test('createdAt 可以是 Firestore Timestamp、Date 或毫秒', () => {
  const ts = { toMillis: () => ms(23) }
  assert.equal(toMillis(ts), ms(23))
  assert.equal(toMillis(new Date(ms(23))), ms(23))
  assert.equal(toMillis(ms(23)), ms(23))
  assert.equal(toMillis(null), null)
  assert.equal(toMillis('2026-11-23'), null)
  const r = plan({ linkedAt: { toMillis: () => ms(20) }, expenses: [expense('e1', { createdAt: ts })] })
  assert.equal(r.upserts.length, 1)
})

test('toDateString 用本機日期；mapIncomeCategory', () => {
  assert.equal(toDateString(new Date(2026, 10, 3, 23, 59).getTime()), '2026-11-03')
  assert.equal(toDateString(new Date(2026, 0, 31, 0, 0).getTime()), '2026-01-31')
  assert.equal(mapIncomeCategory('refund'), 'refund')
  assert.equal(mapIncomeCategory('salary'), 'salary')
  assert.equal(mapIncomeCategory('advance'), 'other')
  assert.equal(mapIncomeCategory(undefined), 'other')
})
