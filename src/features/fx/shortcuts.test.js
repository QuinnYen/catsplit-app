import test from 'node:test'
import assert from 'node:assert/strict'
import { shortcutList, payParams, anyOn } from './shortcuts.js'
import { computePay, DEFAULT_FX_SETTINGS } from './fxMath.js'

const settings = { ...DEFAULT_FX_SETTINGS, showShortcuts: { card: true, taxFree: true, service: true, addTax: true, tip: true }, customShortcuts: [{ id: 'a1', name: '折扣', percent: 5, kind: 'deduct' }] }

test('shortcutList：內建五個加自訂，扣除的自訂是負號', () => {
  const list = shortcutList(settings)
  assert.deepEqual(list.map((x) => x.id), ['card', 'taxFree', 'service', 'addTax', 'tip', 'c:a1'])
  assert.equal(list.find((x) => x.id === 'c:a1').sign, -1)
  assert.equal(list.find((x) => x.id === 'service').percent, 10)
})

test('payParams：只帶開啟的捷徑，自訂扣除是負的百分比', () => {
  const list = shortcutList(settings)
  const p = payParams(list, new Set(['taxFree', 'service', 'c:a1', 'gone']))
  assert.equal(p.taxFree, true)
  assert.equal(p.card, false)
  assert.deepEqual(p.extras, [{ key: 'service', percent: 10 }, { key: 'c:a1', percent: -5 }])
  assert.equal(anyOn(list, new Set(['gone'])), false)
  assert.equal(anyOn(list, new Set(['tip'])), true)
})

test('實付：免稅後各項各自加上去、不疊加，刷卡加在全部加總上（JPY 1,000）', () => {
  const list = shortcutList(settings)
  const r = computePay({ amount: 1000, from: 'JPY', pay: 'JPY', rates: null, ...payParams(list, new Set(['taxFree', 'service', 'card'])) })
  const net = 1000 / 1.1
  assert.ok(Math.abs(r.afterTax - net) < 1e-9)
  assert.ok(Math.abs(r.lines[0].amount - net * 0.1) < 1e-9)
  assert.ok(Math.abs(r.subtotal - net * 1.1) < 1e-9) // 1,000
  assert.ok(Math.abs(r.fee - 1000 * 0.015) < 1e-9)
  assert.ok(Math.abs(r.total - 1015) < 1e-9)
})

test('實付：外加稅、小費、扣除型自訂捷徑同樣以免稅後金額為基準', () => {
  const list = shortcutList(settings)
  const r = computePay({ amount: 100, from: 'USD', pay: 'USD', rates: null, ...payParams(list, new Set(['addTax', 'tip', 'c:a1'])) })
  assert.deepEqual(r.lines.map((l) => l.amount), [8, 15, -5])
  assert.equal(r.total, 118)
})

test('預設只顯示刷卡和免稅；隱藏的捷徑不參與計算', () => {
  const list = shortcutList(DEFAULT_FX_SETTINGS)
  assert.deepEqual(list.filter((x) => x.visible).map((x) => x.id), ['card', 'taxFree'])
  assert.equal(anyOn(list, new Set(['tip'])), false) // tip 被隱藏
  assert.deepEqual(payParams(list, new Set(['service', 'taxFree'])).extras, [])
  assert.equal(payParams(list, new Set(['service', 'taxFree'])).taxFree, true)
})

test('自訂捷徑沒寫 visible 就是顯示，寫 false 才隱藏', () => {
  const list = shortcutList({ ...DEFAULT_FX_SETTINGS, customShortcuts: [{ id: 'a', name: 'x', percent: 1, kind: 'add' }, { id: 'b', name: 'y', percent: 1, kind: 'add', visible: false }] })
  assert.deepEqual(list.filter((x) => x.id.startsWith('c:')).map((x) => x.visible), [true, false])
})
