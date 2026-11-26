import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entryScriptOf, currentEntryScript, findNewVersion } from './versionCheck.js'

const html = (hash) => `<html><head><script type="module" crossorigin src="/assets/index-${hash}.js"></script><link rel="stylesheet" href="/assets/index-xyz.css"></head></html>`
const res = (body, ok = true) => ({ ok, text: async () => body })

test('entryScriptOf：從 HTML 找入口 JS；找不到回 null', () => {
  assert.equal(entryScriptOf(html('Cof0EgaN')), '/assets/index-Cof0EgaN.js')
  assert.equal(entryScriptOf('<html></html>'), null)
  assert.equal(entryScriptOf(undefined), null)
  assert.equal(entryScriptOf('<script src="/assets/react-BbfU3ZlQ.js"></script>'), null)
})

test('currentEntryScript：讀目前載入的入口 JS；開發模式（沒有雜湊檔名）回 null', () => {
  assert.equal(currentEntryScript({ scripts: [{ src: 'https://x.web.app/assets/react-1.js' }, { src: 'https://x.web.app/assets/index-AbC_1-2.js' }] }), '/assets/index-AbC_1-2.js')
  assert.equal(currentEntryScript({ scripts: [{ src: 'http://127.0.0.1:5173/src/main.jsx' }] }), null)
  assert.equal(currentEntryScript({ scripts: [] }), null)
  assert.equal(currentEntryScript(undefined), null)
})

test('findNewVersion：不同回新路徑；相同、失敗、非 200、沒有入口、沒有目前版本都回 null', async () => {
  const cur = '/assets/index-OLD.js'
  assert.equal(await findNewVersion(cur, async () => res(html('NEW'))), '/assets/index-NEW.js')
  assert.equal(await findNewVersion(cur, async () => res(html('OLD'))), null)
  assert.equal(await findNewVersion(cur, async () => { throw new Error('offline') }), null)
  assert.equal(await findNewVersion(cur, async () => res('', false)), null)
  assert.equal(await findNewVersion(cur, async () => res('<html></html>')), null)
  assert.equal(await findNewVersion(null, async () => res(html('NEW'))), null)
  let url, opts
  await findNewVersion(cur, async (u, o) => { url = u; opts = o; return res(html('OLD')) })
  assert.equal(url, '/'); assert.equal(opts.cache, 'no-store')
})
