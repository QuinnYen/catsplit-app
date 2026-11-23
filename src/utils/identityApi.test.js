import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiUrl, createIdentityApi, ApiError } from './identityApi.js'

const BASE = 'https://asia-east1-catsplit-app.cloudfunctions.net/lineLogin'

test('apiUrl：把 lineLogin 換成函式名稱；沒設定時回 null', () => {
  assert.equal(apiUrl('bindIdentity', BASE), 'https://asia-east1-catsplit-app.cloudfunctions.net/bindIdentity')
  assert.equal(apiUrl('listIdentities', 'http://127.0.0.1:5001/demo/asia-east1/lineLogin'), 'http://127.0.0.1:5001/demo/asia-east1/listIdentities')
  assert.equal(apiUrl('x', undefined), null)
})

const fakeFetch = (response) => {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    if (response instanceof Error) throw response
    return { ok: response.status < 400, status: response.status, json: async () => response.body }
  }
  return { fn, calls }
}

test('每個呼叫都帶 Bearer、JSON body，打到對應的函式網址', async () => {
  const { fn, calls } = fakeFetch({ status: 200, body: { ok: true } })
  const api = createIdentityApi({ baseUrl: BASE, fetchFn: fn })
  await api.listIdentities('tok')
  await api.bindIdentity('tok', { provider: 'google', idToken: 'g' })
  await api.executeMerge('tok', 'a.b', { 'settings/profile': 'keep' })
  await api.unbindIdentity('tok', 'google:1')
  assert.deepEqual(calls.map((c) => c.url.split('/').pop()), ['listIdentities', 'bindIdentity', 'executeMerge', 'unbindIdentity'])
  assert.ok(calls.every((c) => c.init.method === 'POST' && c.init.headers.Authorization === 'Bearer tok' && c.init.headers['Content-Type'] === 'application/json'))
  assert.deepEqual(JSON.parse(calls[1].init.body), { provider: 'google', idToken: 'g' })
  assert.deepEqual(JSON.parse(calls[2].init.body), { mergeId: 'a.b', resolutions: { 'settings/profile': 'keep' } })
  assert.deepEqual(JSON.parse(calls[3].init.body), { identityId: 'google:1' })
})

test('成功時回傳 JSON', async () => {
  const { fn } = fakeFetch({ status: 200, body: { status: 'bound' } })
  assert.deepEqual(await createIdentityApi({ baseUrl: BASE, fetchFn: fn }).bindIdentity('t', {}), { status: 'bound' })
})

test('失敗時丟 ApiError，帶雲端函式的錯誤碼、狀態與其他欄位', async () => {
  const { fn } = fakeFetch({ status: 409, body: { error: 'merge_in_progress', mergeId: 'x' } })
  const err = await createIdentityApi({ baseUrl: BASE, fetchFn: fn }).executeMerge('t', 'x').catch((e) => e)
  assert.ok(err instanceof ApiError)
  assert.deepEqual([err.code, err.status, err.data.mergeId], ['merge_in_progress', 409, 'x'])
})

test('回應不是 JSON 時用 http 狀態當錯誤碼；網路失敗是 network；沒設定網址是 not_configured', async () => {
  const noJson = { ok: false, status: 502, json: async () => { throw new Error('not json') } }
  const err1 = await createIdentityApi({ baseUrl: BASE, fetchFn: async () => noJson }).listIdentities('t').catch((e) => e)
  assert.equal(err1.code, 'http_502')
  const { fn } = fakeFetch(new Error('offline'))
  const err2 = await createIdentityApi({ baseUrl: BASE, fetchFn: fn }).listIdentities('t').catch((e) => e)
  assert.deepEqual([err2.code, err2.status], ['network', 0])
  const err3 = await createIdentityApi({ baseUrl: undefined, fetchFn: fn }).listIdentities('t').catch((e) => e)
  assert.equal(err3.code, 'not_configured')
})
