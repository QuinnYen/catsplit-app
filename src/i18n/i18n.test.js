import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zhTW from './zh-TW.js'
import en from './en.js'
import { normalizeLang, pickLanguage, translate } from './core.js'
import { makeFormat } from './format.js'

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

test('字典：兩種語言的 key 集合相同', () => {
  assert.deepEqual(Object.keys(zhTW).sort(), Object.keys(en).sort())
})

test('字典：同一個 key 在兩種語言的佔位符相同', () => {
  for (const key of Object.keys(zhTW)) {
    assert.equal(placeholders(zhTW[key]), placeholders(en[key]), key)
  }
})

test('字典：所有值都是非空字串', () => {
  for (const dict of [zhTW, en]) {
    for (const [key, value] of Object.entries(dict)) {
      assert.ok(typeof value === 'string' && value.trim() !== '', key)
    }
  }
})

// 程式裡以字面 key 呼叫 t('...') 的地方，每個 key 都必須存在於字典
// 用字串串接或 template 組成的動態 key 會被略過，由各自的代碼表另外檢查
const LITERAL_KEY = /\bt\(\s*['"]([\w.-]+)['"]\s*[,)]/g
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name)
  return e.isDirectory() ? walk(p) : /\.jsx?$/.test(e.name) && !/\.test\.js$/.test(e.name) ? [p] : []
})

test('字面 key：程式裡用到的 t() key 都存在於字典', () => {
  const missing = []
  for (const file of walk('src')) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(LITERAL_KEY)) {
      if (!(m[1] in zhTW)) missing.push(`${file}: ${m[1]}`)
    }
  }
  assert.deepEqual(missing, [])
})

test('字面 key regex：能取得完整字面 key，略過串接、template 與 at()', () => {
  const grab = (s) => [...s.matchAll(LITERAL_KEY)].map((m) => m[1])
  assert.deepEqual(grab("t('lang.zh-TW') t('group.total', { n: 1 }) t(\"errors.generic\")"), ['lang.zh-TW', 'group.total', 'errors.generic'])
  assert.deepEqual(grab("t('payMethod.'+code) t(`category.${c}`) at('x.y')"), [])
})

test('normalizeLang：zh 開頭為 zh-TW，其他語言為 en，空值為 null', () => {
  assert.equal(normalizeLang('zh-TW'), 'zh-TW')
  assert.equal(normalizeLang('zh-CN'), 'zh-TW')
  assert.equal(normalizeLang('en-US'), 'en')
  assert.equal(normalizeLang('ja'), 'en')
  assert.equal(normalizeLang(''), null)
  assert.equal(normalizeLang(undefined), null)
})

test('pickLanguage：手動選擇優先於儲存值，儲存值優先於自動判定', () => {
  assert.equal(pickLanguage({ urlLang: 'en', stored: 'zh-TW', enReady: true }), 'en')
  assert.equal(pickLanguage({ stored: 'en', liffLang: 'zh-TW', enReady: true }), 'en')
})

test('pickLanguage：EN_READY 為 false 時，自動判定一律是 zh-TW', () => {
  assert.equal(pickLanguage({ liffLang: 'en', navLang: 'en-US', enReady: false }), 'zh-TW')
  assert.equal(pickLanguage({ stored: 'en', enReady: false }), 'en')
})

test('pickLanguage：EN_READY 為 true 時依 LIFF、瀏覽器、預設 zh-TW 的順序', () => {
  assert.equal(pickLanguage({ liffLang: 'ja', navLang: 'zh-TW', enReady: true }), 'en')
  assert.equal(pickLanguage({ navLang: 'en-US', enReady: true }), 'en')
  assert.equal(pickLanguage({ enReady: true }), 'zh-TW')
})

test('translate：取代 {name} 佔位符；缺 key 先退回 zh-TW，再退回 key 本身', () => {
  const dicts = { 'zh-TW': { a: '你好 {name}', b: '只有中文' }, en: { a: 'Hello {name}' } }
  assert.equal(translate(dicts, 'en', 'a', { name: 'Cat' }), 'Hello Cat')
  assert.equal(translate(dicts, 'en', 'b'), '只有中文')
  assert.equal(translate(dicts, 'en', 'zzz'), 'zzz')
  assert.equal(translate(dicts, 'zh-TW', 'a'), '你好 {name}')
})

test('translate：缺 key 時呼叫 onMissing', () => {
  const seen = []
  translate({ 'zh-TW': { b: '中' }, en: {} }, 'en', 'b', undefined, (k) => seen.push(k))
  assert.deepEqual(seen, ['b'])
})

test('makeFormat：數字與月份', () => {
  assert.equal(makeFormat('en').num(1234.5), '1,234.5')
  assert.equal(makeFormat('zh-TW').month(new Date(2026, 9, 1)), '10月')
  assert.equal(makeFormat('zh-TW').date(new Date(2026, 9, 10)), '2026年10月10日')
  assert.equal(makeFormat('zh-TW').shortDate(new Date(2026, 9, 10)), '2026/10/10')
  assert.equal(makeFormat('en').weekdays.length, 7)
})
