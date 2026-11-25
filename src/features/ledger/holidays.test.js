import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHolidayYear, isWeekend, makeIsHoliday, loadHolidayYears, holidayUrls } from './holidays.js'

// 一整年的假資料：2026 全部是工作日，只有 1/1 國定假日；2/14 是補班的週六
const year2026 = () => {
  const out = []
  for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    out.push({ date, week: '', isHoliday: date === '20260101', description: '' })
  }
  return out
}
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m } }
const okRes = (json) => ({ ok: true, json: async () => json })

test('parseHolidayYear：整年資料轉成日期對照，格式不對回 null', () => {
  const map = parseHolidayYear(year2026())
  assert.equal(map.size, 365)
  assert.equal(map.get('2026-01-01'), true)
  assert.equal(map.get('2026-02-14'), false)
  assert.equal(parseHolidayYear([]), null)
  assert.equal(parseHolidayYear({ a: 1 }), null)
  assert.equal(parseHolidayYear([...year2026().slice(0, 400), { date: 'x', isHoliday: true }]), null)
})

test('isWeekend 與 makeIsHoliday：有資料用資料（補班日不是假日），沒資料退回週末', () => {
  assert.equal(isWeekend('2026-11-28'), true) // 週六
  assert.equal(isWeekend('2026-11-30'), false)
  const is = makeIsHoliday(new Map([['2026', parseHolidayYear(year2026())]]))
  assert.equal(is('2026-01-01'), true)
  assert.equal(is('2026-02-14'), false) // 資料說是工作日（補班），即使是週六
  assert.equal(is('2027-01-02'), true) // 沒有 2027 的資料：週六
  assert.equal(is('2027-01-04'), false)
  assert.equal(makeIsHoliday(new Map([['2026', null]]))('2026-11-29'), true)
})

test('loadHolidayYears：第一個來源失敗改用第二個，並快取；再載入不再抓', async () => {
  const storage = memStorage()
  const calls = []
  const fetchImpl = async (url) => { calls.push(url); if (url.includes('jsdelivr')) throw new Error('blocked'); return okRes(year2026()) }
  const r = await loadHolidayYears([2026, 2026], { storage, fetchImpl, now: 1000 })
  assert.equal(r.get('2026').get('2026-01-01'), true)
  assert.deepEqual(calls, holidayUrls('2026'))
  const again = await loadHolidayYears([2026], { storage, fetchImpl: async () => { throw new Error('should not fetch') }, now: 1000 + 1000 })
  assert.equal(again.get('2026').size, 365)
})

test('loadHolidayYears：快取 30 天後過期重抓；沒有該年（404）快取一天；完全連不上不快取', async () => {
  const storage = memStorage()
  await loadHolidayYears([2026], { storage, fetchImpl: async () => okRes(year2026()), now: 0 })
  let fetched = 0
  await loadHolidayYears([2026], { storage, fetchImpl: async () => { fetched += 1; return okRes(year2026()) }, now: 31 * 24 * 3600 * 1000 })
  assert.equal(fetched, 1)

  const notFound = { ok: false, status: 404, json: async () => ({}) }
  const s2 = memStorage()
  const r = await loadHolidayYears([2099], { storage: s2, fetchImpl: async () => notFound, now: 0 })
  assert.equal(r.get('2099'), null)
  let again = 0
  await loadHolidayYears([2099], { storage: s2, fetchImpl: async () => { again += 1; return notFound }, now: 3600 * 1000 })
  assert.equal(again, 0) // 一天內不再試
  await loadHolidayYears([2099], { storage: s2, fetchImpl: async () => { again += 1; return notFound }, now: 25 * 3600 * 1000 })
  assert.ok(again > 0)

  const s3 = memStorage()
  const down = await loadHolidayYears([2026], { storage: s3, fetchImpl: async () => { throw new Error('offline') }, now: 0 })
  assert.equal(down.get('2026'), null)
  assert.equal(s3.m.size, 0)
})

test('沒有 storage 也能用（無痕模式）', async () => {
  const r = await loadHolidayYears([2026], { fetchImpl: async () => okRes(year2026()) })
  assert.equal(r.get('2026').size, 365)
})
