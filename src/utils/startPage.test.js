import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getStartPage, setStartPage, startPath, takeLaunch, DEFAULT_START_PAGE } from './startPage.js'

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }

test('預設是記帳；存過就用存的；不合法的值退回預設', () => {
  const s = memory()
  assert.equal(getStartPage(s), DEFAULT_START_PAGE)
  assert.equal(DEFAULT_START_PAGE, 'ledger')
  setStartPage('goals', s)
  assert.equal(getStartPage(s), 'goals')
  s.setItem('cs-start-page', 'nope')
  assert.equal(getStartPage(s), 'ledger')
  setStartPage('nope', s)
  assert.equal(s.getItem('cs-start-page'), 'nope') // 不合法的 id 不寫入，原值不變
})

test('storage 壞掉（拋錯或不存在）時不丟錯', () => {
  const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
  assert.equal(getStartPage(broken), 'ledger')
  assert.doesNotThrow(() => setStartPage('fx', broken))
  assert.equal(getStartPage(null), 'ledger')
  assert.equal(takeLaunch(broken), false)
})

test('startPath：各偏好的路徑；訪客的記帳與目標退回分帳', () => {
  assert.equal(startPath('home', false), '/home')
  assert.equal(startPath('ledger', false), '/ledger')
  assert.equal(startPath('split', false), '/')
  assert.equal(startPath('goals', false), '/savings')
  assert.equal(startPath('fx', false), '/fx')
  assert.equal(startPath('ledger', true), '/')
  assert.equal(startPath('goals', true), '/')
  assert.equal(startPath('fx', true), '/fx')
  assert.equal(startPath('???', false), '/ledger')
})

test('takeLaunch：第一次 true，之後 false', () => {
  const s = memory()
  assert.equal(takeLaunch(s), true)
  assert.equal(takeLaunch(s), false)
  assert.equal(takeLaunch(s), false)
})
