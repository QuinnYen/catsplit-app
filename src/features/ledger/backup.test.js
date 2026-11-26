import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBackup, parseBackup, planRestore, backupFileName, BACKUP_FORMAT, LIMITS } from './backup.js'

const ts = (ms) => ({ toMillis: () => ms })
const ledger = { id: 'default', name: '大阪', baseCurrency: 'TWD', monthStartDay: 5, monthBudget: 30000, createdAt: ts(1000) }
const accounts = [
  { id: 'cash', name: '現金', type: 'cash', currency: 'TWD', initialBalance: 1000, balance: 123, kind: 'normal', createdAt: ts(1100) },
  { id: 'jp', name: '日圓現金', type: 'cash', currency: 'JPY', initialBalance: 0, balance: 0, kind: 'normal', archived: true, createdAt: ts(1200) },
  { id: 'snap_g1', name: '日本行', type: 'group', currency: 'TWD', initialBalance: 0, balance: 0, kind: 'group', syncedCount: 1, syncedNet: -5, createdAt: ts(1300) },
]
const manual = { type: 'manual' }
const transactions = [
  { id: 't1', type: 'expense', accountId: 'cash', amount: 300, currency: 'TWD', exchangeRate: 1, baseAmount: 300, category: 'food', note: '拉麵', date: '2026-11-02', source: manual, createdAt: ts(2000) },
  { id: 't2', type: 'income', accountId: 'cash', amount: 5000, currency: 'TWD', exchangeRate: 1, baseAmount: 5000, category: 'salary', date: '2026-11-03', source: manual, createdAt: ts(2100) },
  { id: 't3', type: 'transfer', accountId: 'cash', toAccountId: 'jp', amount: 1000, currency: 'TWD', toAmount: 4800, date: '2026-11-04', source: manual, createdAt: ts(2200) },
  { id: 'g_g1_e_x', type: 'expense', accountId: 'snap_g1', amount: 5, currency: 'TWD', exchangeRate: 1, baseAmount: 5, date: '2026-11-05', source: { type: 'group', groupId: 'g1', kind: 'expense', itemId: 'x' }, createdAt: ts(2300) },
  { id: 'g_g1_e_y', type: 'expense', accountId: 'cash', amount: 50, currency: 'TWD', exchangeRate: 1, baseAmount: 50, title: '章魚燒', date: '2026-11-06', source: { type: 'group', groupId: 'g1', kind: 'expense', itemId: 'y', detached: true }, createdAt: ts(2400) },
  { id: 'r_r1_2026-11-05', type: 'expense', accountId: 'cash', amount: 8000, currency: 'TWD', exchangeRate: 1, baseAmount: 8000, title: '房租', date: '2026-11-05', source: { type: 'recurring', ruleId: 'r1', scheduled: '2026-11-05' }, createdAt: ts(2500) },
]
const categories = [{ id: 'e_food', kind: 'expense', key: 'food', order: 0, name: '美食', budget: 5000 }, { id: 'e_c_abc', kind: 'expense', key: 'c_abc', order: 1, name: '咖啡' }]
const recurring = [{ id: 'r1', kind: 'expense', name: '房租', accountId: 'cash', amount: 8000, category: 'food', frequency: 'monthly', startDate: '2026-09-05', dayOfMonth: 5, enabled: true, generatedThrough: '2026-11-05', createdAt: ts(3000) }]
const build = () => buildBackup({ ledger, accounts, transactions, categories, recurring, now: 9999 })

test('buildBackup：快照帳戶與快照帳目不備份，已匯入的群組帳目有；時間轉成毫秒', () => {
  const b = build()
  assert.equal(b.format, BACKUP_FORMAT)
  assert.equal(b.version, 1)
  assert.deepEqual(b.accounts.map((a) => a.id), ['cash', 'jp'])
  assert.ok(!b.transactions.some((t) => t.id === 'g_g1_e_x'))
  assert.ok(b.transactions.some((t) => t.id === 'g_g1_e_y'))
  assert.equal(b.transactions.length, 5)
  assert.equal(b.ledger.createdAt, 1000)
  assert.equal(b.ledger.monthStartDay, 5)
  assert.equal(b.accounts[1].archived, true)
  assert.equal(b.recurring[0].generatedThrough, '2026-11-05')
  assert.equal(b.categories[0].budget, 5000)
  assert.ok(!('syncedCount' in b.accounts[0]) && !('kind' in b.accounts[0]))
})

test('備份能完整通過驗證（來回一次 JSON），摘要正確', () => {
  const r = parseBackup(JSON.parse(JSON.stringify(build())))
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(r.summary, { name: '大阪', baseCurrency: 'TWD', accounts: 2, transactions: 5, categories: 2, recurring: 1, trips: 0, minDate: '2026-11-02', maxDate: '2026-11-06', exportedAt: 9999 })
})

const bad = (mutate) => { const b = JSON.parse(JSON.stringify(build())); mutate(b); return parseBackup(b) }

test('壞檔案：格式、版本、帳本、數量上限', () => {
  assert.equal(parseBackup(null).reason, 'format')
  assert.equal(parseBackup({ format: 'other' }).reason, 'format')
  assert.equal(bad((b) => { b.version = 2 }).reason, 'version')
  assert.equal(bad((b) => { b.version = 0 }).reason, 'version')
  assert.equal(bad((b) => { b.ledger.name = '' }).reason, 'ledger')
  assert.equal(bad((b) => { b.ledger.name = 'x'.repeat(21) }).reason, 'ledger')
  assert.equal(bad((b) => { b.ledger.baseCurrency = 'JP' }).reason, 'ledger')
  assert.equal(bad((b) => { b.transactions = {} }).reason, 'format')
  assert.equal(bad((b) => { b.accounts = [] }).reason, 'account')
  assert.equal(bad((b) => { b.transactions = new Array(LIMITS.transactions + 1).fill(0) }).reason, 'limit')
})

test('壞檔案：帳戶、類別、規則、帳目的欄位與關聯', () => {
  assert.equal(bad((b) => { b.accounts[0].id = 'snap_x' }).reason, 'account')
  assert.equal(bad((b) => { b.accounts[1].id = 'cash' }).reason, 'duplicate')
  assert.equal(bad((b) => { b.accounts[0].currency = 'TW' }).reason, 'account')
  assert.equal(bad((b) => { b.categories[0].id = 'e_wrong' }).reason, 'category')
  assert.equal(bad((b) => { b.categories[1].id = 'e_food'; b.categories[1].key = 'food' }).reason, 'duplicate')
  assert.equal(bad((b) => { b.recurring[0].accountId = 'ghost' }).reason, 'reference')
  assert.equal(bad((b) => { b.recurring[0].frequency = 'hourly' }).reason, 'recurring')
  assert.equal(bad((b) => { b.transactions[0].accountId = 'ghost' }).reason, 'reference')
  assert.equal(bad((b) => { b.transactions[2].toAccountId = 'ghost' }).reason, 'transaction')
  assert.equal(bad((b) => { b.transactions[1].id = b.transactions[0].id }).reason, 'duplicate')
  assert.equal(bad((b) => { b.transactions[0].amount = -1 }).reason, 'transaction')
  assert.equal(bad((b) => { b.transactions[0].date = '2026/11/02' }).reason, 'transaction')
  assert.equal(bad((b) => { b.transactions[0].baseAmount = 0 }).reason, 'transaction')
  assert.equal(bad((b) => { b.transactions[0].id = '../x' }).reason, 'transaction')
  assert.equal(bad((b) => { b.transactions[0].source = { type: 'group', groupId: 'g', kind: 'expense', itemId: 'z' } }).reason, 'transaction') // 未匯入的快照
})

test('planRestore：順序是類別、帳戶、固定項目、帳目，帳本文件單獨；餘額重新計算', () => {
  const p = planRestore(build())
  assert.deepEqual([...new Set(p.ops.map((o) => o.collection))], ['categories', 'accounts', 'recurring', 'transactions'])
  assert.equal(p.ops.length, 2 + 2 + 1 + 5)
  // cash：期初 1000 −300 +5000 −1000（轉出）−50 −8000 = −3350；備份裡的 balance 123 不被採信
  const cash = p.ops.find((o) => o.collection === 'accounts' && o.id === 'cash').data
  assert.equal(cash.balance, -3350)
  assert.equal(p.ops.find((o) => o.collection === 'accounts' && o.id === 'jp').data.balance, 4800)
  assert.equal(cash.kind, 'normal')
  assert.equal(p.ledger.data.name, '大阪')
  assert.equal(p.ledger.data.createdAt, 1000)
  assert.equal(p.ledger.data.monthBudget, 30000)
  assert.ok(!('id' in p.ledger.data))
  const tx = p.ops.find((o) => o.id === 'g_g1_e_y').data
  assert.equal(tx.createdAt, 2400)
  assert.equal(tx.source.detached, true)
  assert.equal(p.ops.find((o) => o.collection === 'recurring').data.generatedThrough, '2026-11-05') // 進度保留，不會重複產生
  assert.deepEqual(p.ops.find((o) => o.collection === 'categories' && o.id === 'e_food').data, { kind: 'expense', key: 'food', order: 0, name: '美食', budget: 5000 })
})

test('planRestore：可指定新名稱（最多 20 字）', () => {
  assert.equal(planRestore(build(), { name: '大阪（還原）' }).ledger.data.name, '大阪（還原）')
  assert.equal(planRestore(build(), { name: 'x'.repeat(30) }).ledger.data.name.length, 20)
})

test('backupFileName', () => {
  assert.equal(backupFileName(ledger, new Date(2026, 10, 5)), '大阪_backup_20261105.json')
})

// ---------- 旅程（匯率頁）----------
const trips = [
  { id: 'tp1', name: '大分溫泉', currency: 'JPY', countInStats: true, rows: ['JPY', 'TWD'], payCurrency: 'JPY', createdAt: ts(4000) },
  { id: 'tp2', name: '舊旅程', currency: 'USD', deletedAt: ts(5000), createdAt: ts(4100) },
]
const withTrips = () => buildBackup({
  ledger, accounts, categories, recurring, now: 9999, trips,
  transactions: [...transactions, { id: 't9', type: 'expense', accountId: 'cash', amount: 980, currency: 'JPY', exchangeRate: 0.21, baseAmount: 205.8, category: 'food', date: '2026-11-08', source: { type: 'fx' }, tripId: 'tp1', createdAt: ts(6000) }],
})

test('旅程：備份帶 trips 與 tripId，時間轉成毫秒，通過驗證', () => {
  const b = withTrips()
  assert.deepEqual(b.trips.map((t) => t.id), ['tp1', 'tp2'])
  assert.equal(b.trips[0].countInStats, true)
  assert.deepEqual(b.trips[0].rows, ['JPY', 'TWD'])
  assert.equal(b.trips[0].createdAt, 4000)
  assert.equal(b.trips[1].deletedAt, 5000)
  assert.ok(!('deletedAt' in b.trips[0]))
  assert.equal(b.transactions.find((t) => t.id === 't9').tripId, 'tp1')
  const r = parseBackup(JSON.parse(JSON.stringify(b)))
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.summary.trips, 2)
})

test('旅程：舊備份沒有 trips 仍可通過；沒有旅程時 trips 是空陣列', () => {
  const old = JSON.parse(JSON.stringify(build()))
  assert.deepEqual(old.trips, [])
  delete old.trips
  assert.equal(parseBackup(old).ok, true)
})

test('旅程：壞資料（重複 id、名稱、幣別、tripId 指向不存在的旅程、數量上限）', () => {
  const mk = (mutate) => { const b = JSON.parse(JSON.stringify(withTrips())); mutate(b); return parseBackup(b) }
  assert.equal(mk((b) => { b.trips[1].id = 'tp1' }).reason, 'duplicate')
  assert.equal(mk((b) => { b.trips[0].name = '' }).reason, 'trip')
  assert.equal(mk((b) => { b.trips[0].currency = 'JP' }).reason, 'trip')
  assert.equal(mk((b) => { b.transactions.at(-1).tripId = 'nope' }).reason, 'reference')
  assert.equal(mk((b) => { b.trips = {} }).reason, 'format')
  assert.equal(mk((b) => { b.trips = Array.from({ length: LIMITS.trips + 1 }, (_, i) => ({ id: `x${i}`, name: 'a', currency: 'JPY' })) }).reason, 'limit')
})

test('旅程：還原計畫在帳戶與帳目之前寫旅程，deletedAt 保留', () => {
  const plan = planRestore(JSON.parse(JSON.stringify(withTrips())))
  const order = plan.ops.map((o) => o.collection)
  assert.ok(order.indexOf('trips') > order.lastIndexOf('categories'))
  assert.ok(order.lastIndexOf('trips') < order.indexOf('accounts'))
  const tp2 = plan.ops.find((o) => o.collection === 'trips' && o.id === 'tp2')
  assert.equal(tp2.data.deletedAt, 5000)
  assert.equal(tp2.data.createdAt, 4100)
  assert.equal(plan.ops.find((o) => o.id === 't9').data.tripId, 'tp1')
})
