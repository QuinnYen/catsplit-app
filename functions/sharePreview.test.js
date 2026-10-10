import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHl, previewText } from './sharePreview.js'

test('normalizeHl：只認 en，其他值（含 lang 風格的 zh-TW、ja、空值）一律是繁體中文', () => {
  assert.equal(normalizeHl('en'), 'en')
  for (const v of [undefined, '', 'zh-TW', 'EN', 'ja', ['en', 'en'], null]) assert.equal(normalizeHl(v), 'zh-TW')
})

test('previewText：中文版與改動前逐字相同', () => {
  assert.deepEqual(previewText('墾丁之旅'), { site: '貓咪分帳 CatSplit', description: '分帳群組・點開進入記帳', title: '墾丁之旅｜貓咪分帳 CatSplit' })
  assert.equal(previewText(undefined).title, '貓咪分帳 CatSplit')
})

test('previewText：hl=en 時整組文字都是英文', () => {
  const p = previewText('Trip', 'en')
  assert.equal(p.title, 'Trip | CatSplit')
  assert.equal(p.site, 'CatSplit')
  assert.ok(!/[㐀-鿿]/.test(Object.values(p).join('')))
  assert.equal(previewText(undefined, 'en').title, 'CatSplit')
})
