import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zhTW from './zh-TW.js'
import en from './en.js'
import { normalizeLang, pickLanguage, translate } from './core.js'
import { makeFormat } from './format.js'
import { scanCjk } from '../../scripts/check-cjk.mjs'

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

// 單數專用的 `.one` key 只有需要區分單複數的語言才有（英文），不列入兩種語言的 key 比對
const isOne = (key) => key.endsWith('.one')

test('字典：兩種語言的 key 集合相同（不含單數專用的 .one）', () => {
  assert.deepEqual(Object.keys(zhTW).filter((k) => !isOne(k)).sort(), Object.keys(en).filter((k) => !isOne(k)).sort())
})

test('字典：.one 單數 key 一定有對應的原 key，且佔位符相同、含 {n}', () => {
  for (const dict of [zhTW, en]) {
    for (const key of Object.keys(dict).filter(isOne)) {
      const base = key.slice(0, -'.one'.length)
      assert.ok(dict[base] !== undefined, `${key} 沒有對應的 ${base}`)
      assert.equal(placeholders(dict[key]), placeholders(dict[base]), key)
      assert.ok(dict[key].includes('{n}'), `${key} 要用 {n}`)
    }
  }
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

test('translate：n 剛好是 1 且有 .one 時用單數，其他數字與沒有 .one 的語言維持原樣', () => {
  const dicts = {
    'zh-TW': { e: '{n} 筆消費', f: '{n} 筆', g: '{n} 項' },
    en: { e: '{n} expenses', 'e.one': '{n} expense', f: '{n} items' },
  }
  assert.equal(translate(dicts, 'en', 'e', { n: 1 }), '1 expense')
  assert.equal(translate(dicts, 'en', 'e', { n: 0 }), '0 expenses')
  assert.equal(translate(dicts, 'en', 'e', { n: 2 }), '2 expenses')
  assert.equal(translate(dicts, 'en', 'e', { n: '1' }), '1 expenses') // 只認數字 1
  assert.equal(translate(dicts, 'en', 'f', { n: 1 }), '1 items') // 沒有 .one 就維持原樣
  assert.equal(translate(dicts, 'zh-TW', 'e', { n: 1 }), '1 筆消費') // 中文不區分
  assert.equal(translate(dicts, 'en', 'g', { n: 1 }), '1 項') // 缺 key 退回中文時用中文字典判斷
})

test('translate：缺 key 時呼叫 onMissing', () => {
  const seen = []
  translate({ 'zh-TW': { b: '中' }, en: {} }, 'en', 'b', undefined, (k) => seen.push(k))
  assert.deepEqual(seen, ['b'])
})

test('makeFormat：金額依貨幣小數位數固定位數', () => {
  const f = makeFormat('en')
  assert.equal(f.money(12.5, 'USD'), '$ 12.50')
  assert.equal(f.money(1234.567, 'JPY'), '¥ 1,235')
  assert.equal(f.money(4521.37, 'JPY'), '¥ 4,521')
  assert.equal(f.amount(0.5, 'TWD'), '1')
  assert.equal(makeFormat('zh-TW').money(1234.5, 'EUR'), '€ 1,234.50')
})

test('makeFormat：數字與月份', () => {
  assert.equal(makeFormat('en').num(1234.5), '1,234.5')
  assert.equal(makeFormat('zh-TW').month(new Date(2026, 9, 1)), '10月')
  assert.equal(makeFormat('zh-TW').date(new Date(2026, 9, 10)), '2026年10月10日')
  assert.equal(makeFormat('zh-TW').shortDate(new Date(2026, 9, 10)), '2026/10/10')
  assert.equal(makeFormat('en').weekdays.length, 7)
})

test('src 沒有寫死的中文（註解、zh-TW.js、測試檔除外）', () => {
  assert.deepEqual(scanCjk(['src']), [])
})
