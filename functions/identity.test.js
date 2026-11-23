import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  identityKey, isInternalUid, makeUid, resolveLineUid,
  cleanDisplayName, resolveGoogleUid, googleProfileFromPayload, exchangeGoogleLogin,
} from './identity.js'

test('makeUid：u_ 加 20 位十六進位，不以 p_ 開頭', () => {
  const uid = makeUid()
  assert.match(uid, /^u_[0-9a-f]{20}$/)
  assert.equal(isInternalUid(uid), true)
  assert.equal(uid.startsWith('p_'), false)
})

test('makeUid：可注入亂數，補零正確', () => {
  assert.equal(makeUid(() => new Uint8Array(10)), 'u_00000000000000000000')
  assert.equal(makeUid(() => Uint8Array.from([255, 1, 2, 3, 4, 5, 6, 7, 8, 16])), 'u_ff010203040506070810')
})

test('makeUid：連續產生不重複', () => {
  const set = new Set(Array.from({ length: 200 }, () => makeUid()))
  assert.equal(set.size, 200)
})

test('isInternalUid：LINE userId、訪客 id、空值都不是內部 uid', () => {
  assert.equal(isInternalUid('U' + 'a'.repeat(32)), false)
  assert.equal(isInternalUid('p_' + 'a'.repeat(20)), false)
  assert.equal(isInternalUid('u_xyz'), false)
  assert.equal(isInternalUid(undefined), false)
})

test('identityKey：provider:subject', () => {
  assert.equal(identityKey('line', 'U' + 'a'.repeat(32)), 'line:U' + 'a'.repeat(32))
  assert.equal(identityKey('google', '112233445566778899'), 'google:112233445566778899')
})

test('identityKey：拒絕未知 provider 與不安全的 subject', () => {
  assert.throws(() => identityKey('apple', 'x'), /invalid_provider/)
  assert.throws(() => identityKey('line', ''), /invalid_subject/)
  assert.throws(() => identityKey('line', 'a/b'), /invalid_subject/)
  assert.throws(() => identityKey('line', '..'), /invalid_subject/)
  assert.throws(() => identityKey('line', undefined), /invalid_subject/)
  assert.throws(() => identityKey('line', 'a'.repeat(129)), /invalid_subject/)
})

test('resolveLineUid：對照表已有就用對照表的 uid，不重建', () => {
  assert.deepEqual(
    resolveLineUid({ identity: { uid: 'u_00000000000000000001' }, lineUserId: 'Uabc' }),
    { uid: 'u_00000000000000000001', create: false },
  )
})

test('resolveLineUid：對照表沒有就沿用 LINE userId 並要求建立', () => {
  assert.deepEqual(resolveLineUid({ identity: null, lineUserId: 'Uabc' }), { uid: 'Uabc', create: true })
  assert.deepEqual(resolveLineUid({ identity: {}, lineUserId: 'Uabc' }), { uid: 'Uabc', create: true })
  assert.deepEqual(resolveLineUid({ identity: { uid: '' }, lineUserId: 'Uabc' }), { uid: 'Uabc', create: true })
})

// ---------- Google ----------

test('cleanDisplayName：去控制字元與頭尾空白，依字元數截斷，不切壞 emoji', () => {
  assert.equal(cleanDisplayName('  小明\u0000\n  '), '小明')
  assert.equal(cleanDisplayName('a'.repeat(60)), 'a'.repeat(50))
  assert.equal(cleanDisplayName('😀'.repeat(60), 3), '😀😀😀')
  assert.equal(cleanDisplayName(undefined), '')
  assert.equal(cleanDisplayName(123), '')
})

test('resolveGoogleUid：已有對照項用該 uid；沒有就用新 uid 並要求建立', () => {
  assert.deepEqual(resolveGoogleUid({ identity: { uid: 'u_00000000000000000001' }, newUid: 'u_x' }), { uid: 'u_00000000000000000001', create: false })
  assert.deepEqual(resolveGoogleUid({ identity: null, newUid: 'u_00000000000000000002' }), { uid: 'u_00000000000000000002', create: true })
  assert.deepEqual(resolveGoogleUid({ identity: { uid: '' }, newUid: 'u_00000000000000000003' }), { uid: 'u_00000000000000000003', create: true })
})

test('googleProfileFromPayload：取出 sub 與名字，名字缺少時退回 given_name 或空字串', () => {
  assert.deepEqual(googleProfileFromPayload({ iss: 'https://accounts.google.com', sub: '1122', name: ' Amy ' }), { subject: '1122', name: 'Amy', picture: null })
  assert.deepEqual(googleProfileFromPayload({ iss: 'accounts.google.com', sub: '1122', given_name: 'Amy' }), { subject: '1122', name: 'Amy', picture: null })
  assert.deepEqual(googleProfileFromPayload({ iss: 'accounts.google.com', sub: '1122' }), { subject: '1122', name: '', picture: null })
})

test('googleProfileFromPayload：帶出 picture（是否可用由 avatar.js 檢查）', () => {
  assert.equal(googleProfileFromPayload({ iss: 'accounts.google.com', sub: '1122', picture: 'https://lh3.googleusercontent.com/b' }).picture, 'https://lh3.googleusercontent.com/b')
})

test('googleProfileFromPayload：拒絕不明發行者、缺少或不安全的 sub、空 payload', () => {
  assert.throws(() => googleProfileFromPayload({ iss: 'https://evil.example', sub: '1' }), /invalid_issuer/)
  assert.throws(() => googleProfileFromPayload({ iss: 'accounts.google.com' }), /invalid_subject/)
  assert.throws(() => googleProfileFromPayload({ iss: 'accounts.google.com', sub: 'a/b' }), /invalid_subject/)
  assert.throws(() => googleProfileFromPayload(null), /invalid_payload/)
})

const fakeDeps = (over = {}) => {
  const calls = []
  return {
    calls,
    deps: {
      verifyGoogle: async () => ({ iss: 'accounts.google.com', sub: '1122', name: 'Amy' }),
      resolveUid: async (subject) => { calls.push(['resolve', subject]); return { uid: 'u_00000000000000000001', isNew: true } },
      syncProfile: async (uid, name, picture) => { calls.push(['sync', uid, name, picture]); return { name: 'Shown', avatar: 'https://example.com/shown.png', provider: null } },
      createToken: async (uid) => { calls.push(['token', uid]); return `token-${uid}` },
      ...over,
    },
  }
}

test('exchangeGoogleLogin：成功時依序查表、同步資料、發 token', async () => {
  const { deps, calls } = fakeDeps()
  const r = await exchangeGoogleLogin({ idToken: 'abc', ...deps })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { uid: 'u_00000000000000000001', isNew: true, displayName: 'Amy', name: 'Shown', avatar: 'https://example.com/shown.png', provider: null, firebaseToken: 'token-u_00000000000000000001' })
  assert.deepEqual(calls, [['resolve', '1122'], ['sync', 'u_00000000000000000001', 'Amy', null], ['token', 'u_00000000000000000001']])
})

test('exchangeGoogleLogin：缺少或過長的 idToken 回 400，且不會驗證或寫入', async () => {
  const { deps, calls } = fakeDeps({ verifyGoogle: async () => { throw new Error('should not verify') } })
  for (const idToken of [undefined, '', 123, 'x'.repeat(4097)]) {
    assert.equal((await exchangeGoogleLogin({ idToken, ...deps })).status, 400)
  }
  assert.deepEqual(calls, [])
})

test('exchangeGoogleLogin：驗證失敗或 payload 不合法回 401，不查表也不發 token', async () => {
  const bad = fakeDeps({ verifyGoogle: async () => { throw new Error('bad signature') } })
  assert.deepEqual(await exchangeGoogleLogin({ idToken: 'abc', ...bad.deps }), { status: 401, body: { error: 'id_token_invalid' } })
  const wrongIss = fakeDeps({ verifyGoogle: async () => ({ iss: 'https://evil.example', sub: '1' }) })
  assert.equal((await exchangeGoogleLogin({ idToken: 'abc', ...wrongIss.deps })).status, 401)
  assert.deepEqual(bad.calls, [])
  assert.deepEqual(wrongIss.calls, [])
})

test('exchangeGoogleLogin：查表或發 token 失敗時丟出錯誤（由呼叫端轉成 500）', async () => {
  const { deps } = fakeDeps({ resolveUid: async () => { throw new Error('firestore down') } })
  await assert.rejects(() => exchangeGoogleLogin({ idToken: 'abc', ...deps }), /firestore down/)
})

test('resolveLineUid：沒有對照項時，舊使用者沿用 LINE userId，全新的使用者用新的內部 uid；對照項優先', () => {
  const LINE = 'U' + 'a'.repeat(32)
  const NEW = 'u_00000000000000000009'
  assert.deepEqual(resolveLineUid({ identity: null, lineUserId: LINE, legacyExists: true, newUid: NEW }), { uid: LINE, create: true })
  assert.deepEqual(resolveLineUid({ identity: null, lineUserId: LINE, legacyExists: false, newUid: NEW }), { uid: NEW, create: true })
  assert.deepEqual(resolveLineUid({ identity: { uid: 'u_00000000000000000001' }, lineUserId: LINE, legacyExists: false, newUid: NEW }), { uid: 'u_00000000000000000001', create: false })
  // 沒傳 legacyExists 視為舊使用者（維持舊行為）；是新使用者卻沒給 newUid 也不會產生空 uid
  assert.deepEqual(resolveLineUid({ identity: null, lineUserId: LINE }), { uid: LINE, create: true })
  assert.deepEqual(resolveLineUid({ identity: null, lineUserId: LINE, legacyExists: false }), { uid: LINE, create: true })
})
