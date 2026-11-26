import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTripData, splitTrips, tripRange, TRIP_NAME_MAX } from './trips.js'

test('buildTripData：名稱去空白、字數上限；日期選填，沒填就不放欄位', () => {
  assert.deepEqual(buildTripData({ name: '  大分溫泉 ', currency: 'JPY' }), { ok: true, data: { name: '大分溫泉', currency: 'JPY', countInStats: false } })
  const long = buildTripData({ name: 'a'.repeat(TRIP_NAME_MAX + 5), currency: 'JPY' })
  assert.equal(long.data.name.length, TRIP_NAME_MAX)
  const full = buildTripData({ name: '旅', currency: 'USD', startDate: '2026-11-07', endDate: '2026-11-10', countInStats: true })
  assert.deepEqual(full.data, { name: '旅', currency: 'USD', countInStats: true, startDate: '2026-11-07', endDate: '2026-11-10' })
})

test('buildTripData：名稱、幣別、日期的錯誤', () => {
  assert.equal(buildTripData({ name: '   ', currency: 'JPY' }).reason, 'name')
  assert.equal(buildTripData({ name: '旅', currency: '' }).reason, 'currency')
  assert.equal(buildTripData({ name: '旅', currency: 'JP' }).reason, 'currency')
  assert.equal(buildTripData({ name: '旅', currency: 'JPY', startDate: '2026-02-30' }).reason, 'date')
  assert.equal(buildTripData({ name: '旅', currency: 'JPY', endDate: 'abc' }).reason, 'date')
  assert.equal(buildTripData({ name: '旅', currency: 'JPY', startDate: '2026-11-10', endDate: '2026-11-07' }).reason, 'dateOrder')
  assert.equal(buildTripData({ name: '旅', currency: 'JPY', startDate: '2026-11-07', endDate: '2026-11-07' }).ok, true)
})

const ts = (ms) => ({ toMillis: () => ms })

test('splitTrips：進行中與已封存各自新到舊，垃圾桶中的不列出，剛寫入的排最前', () => {
  const trips = [
    { id: 'old', createdAt: ts(1) },
    { id: 'new', createdAt: ts(5) },
    { id: 'pending' }, // createdAt 還沒回填
    { id: 'arch', createdAt: ts(3), archived: true },
    { id: 'trash', createdAt: ts(9), deletedAt: ts(10) },
    { id: 'archTrash', createdAt: ts(9), archived: true, deletedAt: ts(10) },
  ]
  const { active, archived } = splitTrips(trips)
  assert.deepEqual(active.map((t) => t.id), ['pending', 'new', 'old'])
  assert.deepEqual(archived.map((t) => t.id), ['arch'])
  assert.deepEqual(splitTrips([]), { active: [], archived: [] })
})

test('tripRange：出發與回程、單一日期、沒有日期', () => {
  assert.equal(tripRange({ startDate: '2026-11-07', endDate: '2026-11-10' }), '11/7–11/10')
  assert.equal(tripRange({ startDate: '2026-11-07', endDate: '2026-11-07' }), '11/7')
  assert.equal(tripRange({ startDate: '2026-11-07' }), '11/7')
  assert.equal(tripRange({ endDate: '2026-11-10' }), '11/10')
  assert.equal(tripRange({}), '')
})
