import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readCurrentTripId, writeCurrentTripId, readLocalCalc, writeLocalCalc } from './fxLocalPrefs.js'

const memory = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}
const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }

test('目前旅程：每個使用者與帳本各一份，null 代表不選旅程', () => {
  const s = memory()
  assert.equal(readCurrentTripId(s, 'u1', 'l1'), null)
  writeCurrentTripId(s, 'u1', 'l1', 'tp1')
  writeCurrentTripId(s, 'u1', 'l2', 'tp9')
  assert.equal(readCurrentTripId(s, 'u1', 'l1'), 'tp1')
  assert.equal(readCurrentTripId(s, 'u1', 'l2'), 'tp9')
  assert.equal(readCurrentTripId(s, 'u2', 'l1'), null)
  writeCurrentTripId(s, 'u1', 'l1', null)
  assert.equal(readCurrentTripId(s, 'u1', 'l1'), null)
})

test('沒選旅程時的換算列與實付幣別：部分更新、壞內容回空物件', () => {
  const s = memory()
  assert.deepEqual(readLocalCalc(s, 'u1'), {})
  writeLocalCalc(s, 'u1', { rows: ['JPY', 'TWD'] })
  writeLocalCalc(s, 'u1', { pay: 'JPY' })
  assert.deepEqual(readLocalCalc(s, 'u1'), { rows: ['JPY', 'TWD'], pay: 'JPY' })
  s.setItem('cs-fx-calc:u2', '{壞掉')
  assert.deepEqual(readLocalCalc(s, 'u2'), {})
  s.setItem('cs-fx-calc:u3', '[1,2]')
  assert.deepEqual(readLocalCalc(s, 'u3'), {})
})

test('localStorage 不能用（無痕模式、容量滿）時不丟錯', () => {
  assert.equal(readCurrentTripId(broken, 'u1', 'l1'), null)
  assert.doesNotThrow(() => writeCurrentTripId(broken, 'u1', 'l1', 'tp1'))
  assert.doesNotThrow(() => writeCurrentTripId(broken, 'u1', 'l1', null))
  assert.deepEqual(readLocalCalc(broken, 'u1'), {})
  assert.doesNotThrow(() => writeLocalCalc(broken, 'u1', { pay: 'JPY' }))
})
