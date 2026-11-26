import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRASH_DAYS, trashInfo, trashedTrips, expiredTrips, planTripPurge } from './trash.js'

const DAY = 24 * 60 * 60 * 1000
const ts = (ms) => ({ toMillis: () => ms })
const NOW = 100 * DAY

test('TRASH_DAYS 是 30 天', () => {
  assert.equal(TRASH_DAYS, 30)
})

test('trashInfo：不在垃圾桶回 null；剩餘天數進位、滿 30 天算過期', () => {
  assert.equal(trashInfo({}, NOW), null)
  assert.equal(trashInfo({ deletedAt: null }, NOW), null)
  assert.deepEqual(trashInfo({ deletedAt: ts(NOW) }, NOW), { deletedMs: NOW, daysLeft: 30, expired: false }) // 剛刪
  assert.equal(trashInfo({ deletedAt: ts(NOW - 1 * DAY) }, NOW).daysLeft, 29)
  assert.equal(trashInfo({ deletedAt: ts(NOW - 29 * DAY - 1000) }, NOW).daysLeft, 1) // 不到一天也算 1 天
  assert.deepEqual(trashInfo({ deletedAt: ts(NOW - 30 * DAY) }, NOW), { deletedMs: NOW - 30 * DAY, daysLeft: 0, expired: true }) // 剛好滿 30 天
  assert.equal(trashInfo({ deletedAt: ts(NOW - 30 * DAY + 1) }, NOW).expired, false) // 差 1 毫秒還沒滿
  assert.deepEqual(trashInfo({ deletedAt: ts(NOW - 90 * DAY) }, NOW), { deletedMs: NOW - 90 * DAY, daysLeft: 0, expired: true })
})

test('trashedTrips：只列在垃圾桶的，最近刪除的在前', () => {
  const trips = [{ id: 'a' }, { id: 'old', deletedAt: ts(5) }, { id: 'new', deletedAt: ts(9) }, { id: 'pending', deletedAt: null }]
  assert.deepEqual(trashedTrips(trips).map((t) => t.id), ['new', 'old'])
  assert.deepEqual(trashedTrips([]), [])
})

test('expiredTrips：只有滿 30 天的，最早刪除的先處理', () => {
  const trips = [
    { id: 'fresh', deletedAt: ts(NOW - 2 * DAY) },
    { id: 'expired2', deletedAt: ts(NOW - 31 * DAY) },
    { id: 'expired1', deletedAt: ts(NOW - 60 * DAY) },
    { id: 'live' },
  ]
  assert.deepEqual(expiredTrips(trips, NOW).map((t) => t.id), ['expired1', 'expired2'])
  assert.deepEqual(expiredTrips([{ id: 'fresh', deletedAt: ts(NOW) }], NOW), [])
})

const tx = (o) => ({ type: 'expense', accountId: 'cash', amount: 100, ...o })

test('planTripPurge：支出刪掉要加回、收入要扣掉、轉帳兩邊都退', () => {
  const plan = planTripPurge([
    tx({ amount: 980 }), // 現金 −980 → 退回 +980
    tx({ amount: 20, type: 'income' }), // 現金 +20 → 退回 −20
    tx({ type: 'transfer', accountId: 'cash', toAccountId: 'card', amount: 500, toAmount: 480 }), // 現金 −500、卡 +480 → +500、−480
  ])
  assert.deepEqual(plan, { count: 3, deltas: { cash: 1460, card: -480 } })
})

test('planTripPurge：用扣款金額（跨幣別），互相抵銷為 0 的帳戶略過，空清單', () => {
  assert.deepEqual(planTripPurge([tx({ amount: 11811, accountAmount: 2362 })]).deltas, { cash: 2362 })
  assert.deepEqual(planTripPurge([tx({ amount: 50 }), tx({ amount: 50, type: 'income' })]), { count: 2, deltas: {} })
  assert.deepEqual(planTripPurge([]), { count: 0, deltas: {} })
})

test('planTripPurge：小數不累積誤差；快照帳目不影響餘額', () => {
  assert.deepEqual(planTripPurge([tx({ amount: 0.1 }), tx({ amount: 0.2 })]).deltas, { cash: 0.3 })
  const snapshot = tx({ amount: 999, source: { type: 'group', groupId: 'g', kind: 'expense', itemId: 'x' } })
  assert.deepEqual(planTripPurge([snapshot]), { count: 1, deltas: {} })
})
