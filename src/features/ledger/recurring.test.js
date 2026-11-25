import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduledDates, adjustForHoliday, planRecurring, countBackfill, addDays } from './recurring.js'

const rule = (o = {}) => ({ id: 'r1', kind: 'expense', accountId: 'cash', amount: 100, frequency: 'monthly', startDate: '2026-01-05', dayOfMonth: 5, enabled: true, ...o })
const dates = (r, o) => scheduledDates(r, { upTo: '2026-12-31', ...o })

test('每日、每週（依起始日的星期）', () => {
  assert.deepEqual(dates(rule({ frequency: 'daily', startDate: '2026-11-28' }), { upTo: '2026-12-02' }), ['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
  // 2026-11-02 是週一
  assert.deepEqual(dates(rule({ frequency: 'weekly', startDate: '2026-11-02' }), { upTo: '2026-11-30' }), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
  assert.deepEqual(dates(rule({ frequency: 'weekly', startDate: '2026-11-02' }), { after: '2026-11-09', upTo: '2026-11-22' }), ['2026-11-16'])
})

test('每月：指定日、月末、當月沒有那天', () => {
  assert.deepEqual(dates(rule({ startDate: '2026-01-05', dayOfMonth: 5 }), { upTo: '2026-04-30' }), ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'])
  assert.deepEqual(dates(rule({ startDate: '2026-01-01', dayOfMonth: 0 }), { upTo: '2026-04-30' }), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  assert.deepEqual(dates(rule({ startDate: '2028-01-01', dayOfMonth: 0 }), { upTo: '2028-03-31' }), ['2028-01-31', '2028-02-29', '2028-03-31']) // 閏年
  assert.equal(dates(rule({ startDate: '2026-01-31', dayOfMonth: 28 }), { upTo: '2026-02-28' }).at(-1), '2026-02-28')
  // 起始日晚於當月指定日：該月不產生
  assert.deepEqual(dates(rule({ startDate: '2026-01-20', dayOfMonth: 5 }), { upTo: '2026-03-10' }), ['2026-02-05', '2026-03-05'])
})

test('每年：起始日的月與日，2/29 在非閏年取 2/28', () => {
  assert.deepEqual(dates(rule({ frequency: 'yearly', startDate: '2024-02-29' }), { upTo: '2026-12-31' }), ['2024-02-29', '2025-02-28', '2026-02-28'])
  assert.deepEqual(dates(rule({ frequency: 'yearly', startDate: '2026-11-24' }), { upTo: '2028-12-31' }), ['2026-11-24', '2027-11-24', '2028-11-24'])
})

test('結束日、已產生到、上限', () => {
  assert.deepEqual(dates(rule({ endDate: '2026-03-05' }), {}), ['2026-01-05', '2026-02-05', '2026-03-05'])
  assert.deepEqual(dates(rule(), { after: '2026-10-05' }), ['2026-11-05', '2026-12-05'])
  assert.deepEqual(dates(rule(), { after: '2026-12-05' }), [])
  assert.equal(dates(rule({ frequency: 'daily', startDate: '2026-01-01' }), { limit: 3 }).length, 3)
  assert.deepEqual(dates(rule({ startDate: '2027-01-01' }), { upTo: '2026-12-31' }), []) // 還沒到起始日
})

test('假日調整：不調整、提前、延後、連假、找不到時維持原日期', () => {
  const hol = new Set(['2026-02-14', '2026-02-15', '2026-02-16', '2026-02-17'])
  const is = (d) => hol.has(d)
  assert.equal(adjustForHoliday('2026-02-15', 'none', is), '2026-02-15')
  assert.equal(adjustForHoliday('2026-02-13', 'after', is), '2026-02-13') // 不是假日
  assert.equal(adjustForHoliday('2026-02-15', 'before', is), '2026-02-13')
  assert.equal(adjustForHoliday('2026-02-15', 'after', is), '2026-02-18')
  assert.equal(adjustForHoliday('2026-02-15', 'after', () => true), '2026-02-15')
})

const accountsById = { cash: { currency: 'TWD', kind: 'normal' }, jp: { currency: 'JPY', kind: 'normal' }, bank: { currency: 'TWD', kind: 'normal' }, snap: { currency: 'TWD', kind: 'group' } }
const plan = (rules, o = {}) => planRecurring({ rules, today: '2026-03-10', ledgerBaseCurrency: 'TWD', accountsById, ...o })

test('補入：漏掉的每一期，固定 id、來源、金額欄位與餘額增量', () => {
  const r = plan([rule({ name: '房租', category: 'daily', amount: 8000, startDate: '2026-01-05' })])
  assert.equal(r.total, 3)
  assert.equal(r.chunks.length, 1)
  const c = r.chunks[0]
  assert.equal(c.expectedThrough, null)
  assert.equal(c.newThrough, '2026-03-05')
  assert.deepEqual(c.entries.map((e) => e.id), ['r_r1_2026-01-05', 'r_r1_2026-02-05', 'r_r1_2026-03-05'])
  assert.deepEqual(c.entries[0].data, {
    type: 'expense', accountId: 'cash', amount: 8000, currency: 'TWD', title: '房租', date: '2026-01-05', category: 'daily',
    source: { type: 'recurring', ruleId: 'r1', scheduled: '2026-01-05' }, exchangeRate: 1, baseAmount: 8000,
  })
  assert.deepEqual(c.deltas, { cash: -24000 })
})

test('已產生到的不再產生；停用的規則略過；還沒到期的不產生', () => {
  assert.equal(plan([rule({ generatedThrough: '2026-03-05' })]).chunks.length, 0)
  assert.equal(plan([rule({ enabled: false })]).chunks.length, 0)
  assert.equal(plan([rule({ startDate: '2026-04-01', dayOfMonth: 1 })]).chunks.length, 0)
  const next = plan([rule({ generatedThrough: '2026-02-05' })])
  assert.deepEqual(next.chunks[0].entries.map((e) => e.id), ['r_r1_2026-03-05'])
  assert.equal(next.chunks[0].expectedThrough, '2026-02-05')
})

test('收入與轉帳：收入加、轉帳兩邊（固定轉帳兩帳戶同幣別，轉入金額等於轉出）', () => {
  const inc = plan([rule({ kind: 'income', amount: 50000, category: 'salary', startDate: '2026-03-01', dayOfMonth: 1 })])
  assert.deepEqual(inc.chunks[0].deltas, { cash: 50000 })
  const tr = plan([rule({ kind: 'transfer', toAccountId: 'bank', amount: 3000, startDate: '2026-03-01', dayOfMonth: 1 })])
  const e = tr.chunks[0].entries[0].data
  assert.deepEqual([e.type, e.accountId, e.toAccountId, e.amount, e.toAmount, e.currency], ['transfer', 'cash', 'bank', 3000, 3000, 'TWD'])
  assert.ok(!('exchangeRate' in e) && !('baseAmount' in e))
  assert.deepEqual(tr.chunks[0].deltas, { cash: -3000, bank: 3000 })
})

test('帳戶幣別與統計幣別不同：用規則上固定的匯率換成統計金額', () => {
  const r = plan([rule({ accountId: 'jp', amount: 1000, rate: 0.21, startDate: '2026-03-01', dayOfMonth: 1 })])
  const e = r.chunks[0].entries[0].data
  assert.deepEqual([e.currency, e.amount, e.exchangeRate, e.baseAmount], ['JPY', 1000, 0.21, 210])
})

test('假日調整只改 date，id 與原定日期不變', () => {
  const r = plan([rule({ startDate: '2026-03-07', dayOfMonth: 7 })], { holidayAdjust: 'after', isHoliday: (d) => d === '2026-03-07' || d === '2026-03-08' })
  const e = r.chunks[0].entries[0]
  assert.equal(e.id, 'r_r1_2026-03-07')
  assert.equal(e.data.date, '2026-03-09')
  assert.equal(e.data.source.scheduled, '2026-03-07')
})

test('帳戶不存在或是快照帳戶：不產生帳目，但推進進度，不會一直重試', () => {
  const r = plan([rule({ accountId: 'gone' }), rule({ id: 'r2', accountId: 'snap' })])
  assert.equal(r.total, 0)
  assert.deepEqual(r.chunks.map((c) => [c.ruleId, c.entries.length, c.newThrough]), [['r1', 0, '2026-03-05'], ['r2', 0, '2026-03-05']])
})

test('上限：超過就截斷、回報 capped，進度只推到有補入的那一筆；大量時切成區塊', () => {
  const daily = rule({ frequency: 'daily', startDate: '2025-11-01' })
  const r = plan([daily], { cap: 100, chunkSize: 40 })
  assert.equal(r.total, 100)
  assert.equal(r.capped, true)
  assert.deepEqual(r.chunks.map((c) => c.entries.length), [40, 40, 20])
  assert.equal(r.chunks[0].expectedThrough, null)
  assert.equal(r.chunks[1].expectedThrough, r.chunks[0].newThrough)
  assert.equal(r.chunks[2].newThrough, '2026-02-08') // 第 100 天
  const again = plan([{ ...daily, generatedThrough: r.chunks[2].newThrough }], { cap: 100 })
  assert.equal(again.chunks[0].entries[0].data.source.scheduled, '2026-02-09')
  assert.equal(plan([rule()], { cap: 100 }).capped, false)
  // 多個規則共用上限
  const two = plan([rule({ frequency: 'daily', startDate: '2026-03-01' }), rule({ id: 'r2', frequency: 'daily', startDate: '2026-03-01' })], { cap: 15 })
  assert.equal(two.total, 15)
  assert.equal(two.capped, true)
})

test('補入多年：五年每日也算得動', () => {
  const r = planRecurring({ rules: [rule({ frequency: 'daily', startDate: '2021-01-01' })], today: '2026-03-10', ledgerBaseCurrency: 'TWD', accountsById, cap: 5000 })
  assert.equal(r.total, 1895)
  assert.equal(r.chunks.length, 10)
})

test('countBackfill 與 addDays', () => {
  assert.equal(countBackfill(rule({ startDate: '2026-01-05' }), '2026-03-10'), 3)
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
  assert.equal(addDays('2026-01-01', -1), '2025-12-31')
})
