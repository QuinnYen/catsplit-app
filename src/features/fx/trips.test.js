import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTripData, liveTrips, tripHome, TRIP_NAME_MAX } from './trips.js'

test('buildTripData：名稱去空白、字數上限；預算選填，沒填就不放欄位', () => {
  assert.deepEqual(buildTripData({ name: '  大分溫泉 ', currency: 'JPY', homeCurrency: 'TWD' }), { ok: true, data: { name: '大分溫泉', currency: 'JPY', homeCurrency: 'TWD', countInStats: false } })
  const long = buildTripData({ name: 'a'.repeat(TRIP_NAME_MAX + 5), currency: 'JPY', homeCurrency: 'TWD' })
  assert.equal(long.data.name.length, TRIP_NAME_MAX)
  const full = buildTripData({ name: '旅', currency: 'USD', homeCurrency: 'TWD', budget: '30,000.456', countInStats: true })
  assert.deepEqual(full.data, { name: '旅', currency: 'USD', homeCurrency: 'TWD', countInStats: true, budget: 30000.46 })
  assert.ok(!('budget' in buildTripData({ name: '旅', currency: 'USD', homeCurrency: 'TWD', budget: '  ' }).data))
})

test('buildTripData：名稱、兩種幣別、預算的錯誤', () => {
  const ok = { name: '旅', currency: 'JPY', homeCurrency: 'TWD' }
  assert.equal(buildTripData({ ...ok, name: '   ' }).reason, 'name')
  assert.equal(buildTripData({ ...ok, currency: '' }).reason, 'currency')
  assert.equal(buildTripData({ ...ok, currency: 'JP' }).reason, 'currency')
  assert.equal(buildTripData({ ...ok, homeCurrency: '' }).reason, 'homeCurrency')
  assert.equal(buildTripData({ ...ok, homeCurrency: 'JPY' }).reason, 'sameCurrency')
  for (const bad of ['0', '-5', 'abc', '1000000000']) assert.equal(buildTripData({ ...ok, budget: bad }).reason, 'budget', bad)
})

test('tripHome：沒存母國貨幣的舊旅程用帳本統計幣別', () => {
  assert.equal(tripHome({ homeCurrency: 'USD' }, 'TWD'), 'USD')
  assert.equal(tripHome({}, 'TWD'), 'TWD')
  assert.equal(tripHome(undefined, 'TWD'), 'TWD')
  assert.equal(tripHome({ homeCurrency: 'XX' }, 'TWD'), 'TWD')
})

const ts = (ms) => ({ toMillis: () => ms })

test('liveTrips：新到舊，垃圾桶中的不列出，剛寫入的排最前', () => {
  const trips = [
    { id: 'old', createdAt: ts(1) },
    { id: 'new', createdAt: ts(5) },
    { id: 'pending' }, // createdAt 還沒回填
    { id: 'trash', createdAt: ts(9), deletedAt: ts(10) },
  ]
  assert.deepEqual(liveTrips(trips).map((t) => t.id), ['pending', 'new', 'old'])
  assert.deepEqual(liveTrips([]), [])
})
