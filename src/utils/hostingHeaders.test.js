// firebase.json 的快取標頭：每個會回傳 index.html 的網址（App.jsx 的路由）都必須有「no-cache」規則，
// 且不能和 /assets/**（長期快取）重疊。漏掉的話，部署後瀏覽器最多一小時內還會拿到舊的 HTML 和舊的 JS。
// 新增路由時，記得把網址加進 firebase.json 的 hosting.headers。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const headers = JSON.parse(read('../../firebase.json')).hosting.headers
const cacheValue = (h) => h.headers.find((x) => x.key === 'Cache-Control')?.value

// 只支援 ** 與 *（本專案用到的 glob）
const globToRegExp = (glob) =>
  new RegExp('^' + glob.split('**').map((part) => part.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$')
const rulesFor = (path) => headers.filter((h) => globToRegExp(h.source).test(path))

test('App.jsx 的每個路由都有 no-cache 規則（不會被快取成舊的 index.html）', () => {
  const routes = [...read('../App.jsx').matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
  assert.ok(routes.length > 15, '應該讀到所有路由')
  for (const route of routes) {
    const sample = route.replace(/\/\*$/, '/x').replace(/:[A-Za-z]+/g, 'x')
    const values = rulesFor(sample).map(cacheValue)
    assert.ok(values.some((v) => /no-cache|no-store/.test(v ?? '')), `${route}（例 ${sample}）沒有 no-cache 規則，請加進 firebase.json`)
    assert.ok(!values.some((v) => /immutable|max-age/.test(v ?? '')), `${route} 不能被長期快取的規則匹配`)
  }
})

test('/assets/** 維持長期快取，而且不和 no-cache 規則重疊', () => {
  const rules = rulesFor('/assets/index-abc123.js')
  assert.equal(rules.length, 1, '只該有一條規則匹配 /assets/')
  assert.match(cacheValue(rules[0]), /immutable/)
})

test('/index.html 與 /sw.js 不快取', () => {
  for (const p of ['/index.html', '/sw.js']) assert.ok(rulesFor(p).some((h) => /no-store/.test(cacheValue(h) ?? '')), p)
})
