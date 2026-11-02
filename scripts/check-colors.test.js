import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findColors, scanColors } from './check-colors.mjs'

const n = (src) => findColors(src).length

test('回報寫死的色碼', () => assert.equal(n("const a = { background: '#fff8f4' }"), 1))
test('不分大小寫', () => assert.equal(n("const a = { background: '#F0D5C0' }"), 1))
test('允許品牌色', () => {
  for (const c of ['#FF8C42', '#ff6b1a', '#06C755', '#4caf50']) assert.equal(n(`const a = { background: '${c}' }`), 0, c)
})
test('color 屬性的 #fff 允許', () => {
  assert.equal(n("const a = { color: '#fff' }"), 0)
  assert.equal(n('const a = <X color="#fff" />'), 0)
})
test('非 color 屬性的 #fff 回報', () => {
  assert.equal(n("const a = { background: '#fff' }"), 1)
  assert.equal(n("const a = { border: '1px solid #fff' }"), 1)
})
test('color 屬性的三元式：#fff 允許，其他色碼仍回報', () => {
  assert.equal(n("const a = { color: ok ? '#fff' : '#b08060' }"), 1)
  assert.equal(n("const a = { color: ok ? '#b08060' : '#fff' }"), 1)
  assert.equal(n('const a = <X color={ok ? "#fff" : "#b08060"} />'), 1)
})
test('background 屬性的三元式：#fff 回報', () => {
  assert.equal(n("const a = { background: ok ? '#fff' : '#fff8f4' }"), 2)
  assert.equal(n("const a = { color: 'red', background: '#fff' }"), 1)
})
test('封面遮罩的深棕色允許', () => {
  assert.equal(n("const a = { background: 'linear-gradient(90deg, rgba(0,0,0,0.4), rgb(53 19 0) 100%)' }"), 0)
})
test('行尾有 cs-color-ok 標記就豁免', () => {
  assert.equal(n("const a = ['#FFB37A', '#7FA6C9'] // cs-color-ok"), 0)
  assert.equal(n("const a = ['#FFB37A']\nconst b = ['#7FA6C9'] // cs-color-ok"), 1)
})
test('8 位與 4 位十六進位（含透明度）也回報', () => {
  assert.equal(n("const a = { background: '#ffffff80' }"), 1)
  assert.equal(n("const a = { background: '#fff8' }"), 1)
  assert.equal(n("const a = { background: '#FF8C4280' }"), 1)
})
test('white／black 與 hsl() 回報，近似字不誤報', () => {
  assert.equal(n('const a = <svg fill="white" />'), 1)
  assert.equal(n("const a = { color: 'black' }"), 1)
  assert.equal(n("const a = { color: 'hsl(10 20% 30%)' }"), 1)
  assert.equal(n("const a = { color: 'hsla(10, 20%, 30%, 0.5)' }"), 1)
  assert.equal(n("const a = { name: 'whiteboard' }"), 0)
})
test('QR code 的 dark／light 色允許', () => {
  assert.equal(n("QRCode.toDataURL(url, { color: { dark: '#3d2b1f', light: '#ffffff' } })"), 0)
})
test('一個字串多個色碼', () => {
  const hits = findColors("const a = 1\nconst b = 'linear-gradient(135deg, #FF8C42 0%, #fff8f4 100%)'")
  assert.equal(hits.length, 1)
  assert.equal(hits[0].line, 2)
})
test('允許半透明白與黑', () => {
  assert.equal(n("const a = { background: 'rgba(255,255,255,0.9)' }"), 0)
  assert.equal(n("const a = { background: 'rgba(0,0,0,0.4)' }"), 0)
  assert.equal(n("const a = { background: 'rgba(61,43,31,0.4)' }"), 1)
})
test('template literal', () => assert.equal(n('const a = `1px solid #f0d5c0`'), 1))
test('不報變數與註解', () => {
  assert.equal(n("const a = { background: 'var(--cs-bg)' } // #fff8f4"), 0)
})

test('src 沒有寫死的色碼（允許清單、LINE 訊息與裁切畫面除外）', () => {
  assert.deepEqual(scanColors(['src']), [])
})
