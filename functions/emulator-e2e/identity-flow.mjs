// 身分綁定與帳號合併的端到端測試：從 HTTP 端點一路走完（Google 先登入、綁定既有 LINE 帳號、預覽、合併、重新登入、解除綁定…）。
// 需要同時啟動 auth、firestore、functions 模擬器，並預載 functions/scripts/emulator-mocks.mjs 假冒 LINE 與 Google 驗證；
// 做法見 docs/operations.md「本機模擬器跑雲端函式」，用 npm run test:e2e 執行（不屬於 npm test）。
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { computeGroupAggregates } from '../../src/utils/expenseHelpers.js'

const FN = 'http://127.0.0.1:5001/demo-catsplit/asia-east1'
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1'
const J = { 'Content-Type': 'application/json' }
let db

// 開始前清空 Firestore 與 Auth 模擬器的資料，測試才能重複執行（用到的帳號與群組 id 是固定的）
const clearEmulators = async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-catsplit/databases/(default)/documents', { method: 'DELETE' })
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-catsplit/accounts', { method: 'DELETE' })
}

before(async () => {
  initializeApp({ projectId: 'demo-catsplit' })
  db = getFirestore()
  await clearEmulators()
})

const post = async (name, body, idToken) => {
  const res = await fetch(`${FN}/${name}`, { method: 'POST', headers: { ...J, ...(idToken && { Authorization: `Bearer ${idToken}` }) }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const signIn = async (customToken) => {
  const res = await fetch(`${AUTH}/accounts:signInWithCustomToken?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ token: customToken, returnSecureToken: true }) })
  assert.equal(res.status, 200)
  return (await res.json()).idToken
}
const uidOfToken = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).user_id ?? JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).uid
const googleLogin = async (sub) => {
  const r = await post('authExchange', { provider: 'google', idToken: sub })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return { ...r.body, idToken: await signIn(r.body.firebaseToken) }
}
const lineLogin = async (lineId) => {
  const r = await post('verifyLiffToken', { idToken: lineId })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return { ...r.body, idToken: await signIn(r.body.firebaseToken) }
}

const T = 'U' + '9'.repeat(32)
const seedGroup = async (id, { members, createdBy, expenses = [], settlements = [] }) => {
  const ref = db.doc(`groups/${id}`)
  const toDocs = (list) => list.map((d) => ({ data: () => d }))
  await ref.set({
    name: `Group ${id}`, baseCurrency: 'TWD', createdBy, members,
    memberProfiles: Object.fromEntries(members.map((m) => [m, { name: `N-${m.slice(0, 4)}` }])),
    ...computeGroupAggregates(members, toDocs(expenses), toDocs(settlements), []),
  })
  for (const [col, list] of [['expenses', expenses], ['settlements', settlements]]) {
    for (const [i, d] of list.entries()) await ref.collection(col).doc(`${col[0]}${i + 1}`).set(d)
  }
}

// 在整個檔案共用的狀態
const S = {}

test('Google 先登入、LINE 舊使用者有資料：兩邊各自登入', async () => {
  S.L = 'U' + 'e'.repeat(32)
  S.G = await googleLogin('ge2e')
  S.Lg = await lineLogin(S.L)
  assert.match(S.G.uid, /^u_[0-9a-f]{20}$/)
  assert.equal(S.Lg.uid, S.L)
  const { L } = S
  const G = S.G.uid
  await seedGroup('e1', { members: [L, T], createdBy: L })
  await seedGroup('e2', { members: [L, T], createdBy: T })
  await seedGroup('e3', { members: [G, T], createdBy: G, expenses: [{ amount: 8, payments: { [G]: 8 }, splits: { [G]: 4, [T]: 4 }, createdBy: G }] })
  await seedGroup('eBoth', {
    members: [L, G, T], createdBy: G,
    expenses: [{ amount: 90, payments: { [G]: 90 }, splits: { [L]: 30, [G]: 30, [T]: 30 }, createdBy: G }],
    settlements: [{ from: L, to: G, amount: 20, settledBy: L }],
  })
  await db.doc(`users/${L}/paymentMethods/pmL`).set({ providerId: 'bank', value: '111' })
  await db.doc(`users/${L}/settings/profile`).set({ nickname: 'LNick' })
  await db.doc(`users/${G}/paymentMethods/pmG`).set({ providerId: 'line', value: '222' })
  await db.doc(`users/${G}/settings/profile`).set({ nickname: 'GNick' })
})

test('listIdentities：只列自己的；未登入與訪客被擋', async () => {
  const r = await post('listIdentities', {}, S.G.idToken)
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.identities.map((i) => i.provider), ['google'])
  assert.equal((await post('listIdentities', {})).status, 401)
  // 訪客
  await seedGroup('eGuest', { members: [S.L], createdBy: S.L })
  const g = await post('guestLogin', { groupId: 'eGuest', name: 'Amy' })
  const guestToken = await signIn(g.body.firebaseToken)
  for (const name of ['listIdentities', 'bindIdentity', 'executeMerge', 'unbindIdentity']) {
    assert.equal((await post(name, { provider: 'google', idToken: 'x', mergeId: 'x', identityId: 'x' }, guestToken)).status, 401, name)
  }
})

test('bindIdentity：請求不合法 400、憑證無效或過期 401', async () => {
  const t = S.G.idToken
  assert.equal((await post('bindIdentity', {}, t)).status, 400)
  assert.equal((await post('bindIdentity', { provider: 'line', code: 'c', redirectUri: 'https://evil.example/auth/callback' }, t)).status, 400)
  const bad = await post('bindIdentity', { provider: 'google', idToken: 'bad-token' }, t)
  assert.deepEqual([bad.status, bad.body.error], [401, 'proof_invalid'])
  const old = await post('bindIdentity', { provider: 'google', idToken: 'old-sub' }, t)
  assert.deepEqual([old.status, old.body.error], [401, 'proof_expired'])
  const badLine = await post('bindIdentity', { provider: 'line', liffIdToken: 'bad-line' }, t)
  assert.deepEqual([badLine.status, badLine.body.error], [401, 'proof_invalid'])
})

test('bindIdentity：全新的 LINE（授權碼流程）直接綁定；再綁一次是 already_bound', async () => {
  const fresh = 'U' + 'f'.repeat(32)
  const t = (await googleLogin('ge2e-solo')).idToken
  const a = await post('bindIdentity', { provider: 'line', code: fresh, redirectUri: 'http://localhost:5173/auth/callback' }, t)
  assert.deepEqual([a.status, a.body], [200, { status: 'bound' }])
  const b = await post('bindIdentity', { provider: 'line', liffIdToken: fresh }, t)
  assert.deepEqual(b.body, { status: 'already_bound' })
  assert.equal((await db.doc(`identities/line:${fresh}`).get()).data().uid, (await googleLogin('ge2e-solo')).uid)
})

test('bindIdentity：綁定一個已是現有帳號的 LINE → 要求合併，預覽內容正確，還沒改任何資料', async () => {
  const before = (await db.doc('groups/eBoth').get()).data()
  const r = await post('bindIdentity', { provider: 'line', liffIdToken: S.L }, S.G.idToken)
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.status, 'merge_required')
  assert.equal(r.body.initiatorIsDropped, true) // L 有 3 個群組、G 有 2 個
  assert.deepEqual(r.body.groups.bothIn.map((g) => g.id), ['eBoth'])
  assert.deepEqual(r.body.groups.dropOnly.map((g) => g.id), ['e3'])
  assert.deepEqual(r.body.personal.needsChoice.map((c) => c.path), ['settings/profile'])
  assert.equal(r.body.impact.selfTransfers, 1)
  S.mergeId = r.body.mergeId
  assert.deepEqual((await db.doc('groups/eBoth').get()).data(), before)
})

test('executeMerge：不是發起人 403、找不到 404、不合法的選擇 400', async () => {
  const other = await lineLogin('U' + 'd'.repeat(32))
  assert.equal((await post('executeMerge', { mergeId: S.mergeId }, other.idToken)).status, 403)
  assert.equal((await post('executeMerge', { mergeId: 'nope' }, S.G.idToken)).status, 404)
  const badChoice = await post('executeMerge', { mergeId: S.mergeId, resolutions: { 'settings/nope': 'keep' } }, S.G.idToken)
  assert.deepEqual([badChoice.status, badChoice.body.error], [400, 'unknown_conflict_path'])
  assert.equal((await post('executeMerge', { mergeId: S.mergeId, resolutions: 'x' }, S.G.idToken)).status, 400)
  assert.equal((await db.doc(`merges/${S.mergeId}`).get()).data().state, 'previewed')
})

test('executeMerge：合併成功，回傳保留帳號的 token；被刪除帳號的 session 失效', async () => {
  const r = await post('executeMerge', { mergeId: S.mergeId, resolutions: { 'settings/profile': 'keep' } }, S.G.idToken)
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.deepEqual([r.body.ok, r.body.keepUid, r.body.sessionReplaced, r.body.alreadyDone], [true, S.L, true, false])
  const newToken = await signIn(r.body.firebaseToken)
  assert.equal(uidOfToken(newToken), S.L)
  S.Lnew = newToken

  // 舊的 Google 帳號（被併入）已從 Auth 刪除
  const lookup = await fetch(`${AUTH}/accounts:lookup?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ idToken: S.G.idToken }) })
  assert.notEqual(lookup.status, 200)

  const { L } = S
  const G = S.G.uid
  const both = (await db.doc('groups/eBoth').get()).data()
  assert.deepEqual([...both.members].sort(), [L, T].sort())
  assert.equal((await db.doc('groups/eBoth/settlements/s1').get()).exists, false)
  assert.deepEqual((await db.doc('groups/e3').get()).data().members, [L, T])
  assert.equal((await db.doc(`users/${L}/paymentMethods/pmG`).get()).data().value, '222')
  assert.equal((await db.doc(`users/${L}/settings/profile`).get()).data().nickname, 'LNick')
  assert.equal((await db.doc(`users/${G}`).get()).exists, false)
  assert.equal((await db.doc('identities/google:ge2e').get()).data().uid, L)
  assert.equal((await db.doc(`identities/line:${L}`).get()).data().uid, L)
  assert.equal((await db.doc(`mergeBackups/${S.mergeId}`).get()).data().counts.groupDocs > 0, true)

  // 重複呼叫（例如網路重送）直接回結果
  const again = await post('executeMerge', { mergeId: S.mergeId }, newToken)
  assert.equal(again.status, 403) // 新 session 的 uid 是 L，不是發起人 G
  const retryOld = await post('executeMerge', { mergeId: S.mergeId }, S.G.idToken)
  assert.notEqual(retryOld.status, 200) // 舊 session 已失效
})

test('合併後兩種方式登入都進同一個帳號，不是新帳號', async () => {
  const g = await post('authExchange', { provider: 'google', idToken: 'ge2e' })
  assert.deepEqual([g.body.uid, g.body.isNew], [S.L, false])
  const l = await post('verifyLiffToken', { idToken: S.L })
  assert.equal(l.body.uid, S.L)
})

test('listIdentities 與 unbindIdentity：解除 Google 後，這個 Google 再登入會是新的帳號', async () => {
  const list = await post('listIdentities', {}, S.Lnew)
  assert.deepEqual(list.body.identities.map((i) => i.provider).sort(), ['google', 'line'])
  const google = list.body.identities.find((i) => i.provider === 'google')
  const un = await post('unbindIdentity', { identityId: google.id }, S.Lnew)
  assert.deepEqual([un.status, un.body], [200, { ok: true, mode: 'delete' }])
  const fresh = await post('authExchange', { provider: 'google', idToken: 'ge2e' })
  assert.equal(fresh.body.isNew, true)
  assert.notEqual(fresh.body.uid, S.L)
  S.fresh = fresh.body.uid

  // 剩下最後一種（LINE）不能解除
  const last = (await post('listIdentities', {}, S.Lnew)).body.identities
  assert.equal(last.length, 1)
  const refuse = await post('unbindIdentity', { identityId: last[0].id }, S.Lnew)
  assert.deepEqual([refuse.status, refuse.body.error], [409, 'last_identity'])
  assert.equal((await post('unbindIdentity', { identityId: 'google:nope' }, S.Lnew)).status, 404)
  assert.equal((await post('unbindIdentity', {}, S.Lnew)).status, 400)
})

test('再綁定回來：那個 Google 現在是另一個帳號，要合併；發起人是保留的一邊', async () => {
  const r = await post('bindIdentity', { provider: 'google', idToken: 'ge2e' }, S.Lnew)
  assert.equal(r.body.status, 'merge_required')
  assert.equal(r.body.initiatorIsDropped, false)
  const done = await post('executeMerge', { mergeId: r.body.mergeId }, S.Lnew)
  assert.deepEqual([done.status, done.body.keepUid, done.body.sessionReplaced], [200, S.L, false])
  assert.equal((await db.doc('identities/google:ge2e').get()).data().uid, S.L)
  assert.equal((await db.doc(`users/${S.fresh}`).get()).exists, false)
})

test('同一個合併同時執行兩次：只有一次真的執行，另一次被擋（租約）', async () => {
  const G2 = await googleLogin('ge2e-race')
  const L2 = 'U' + 'c'.repeat(32)
  await lineLogin(L2)
  await seedGroup('r1', { members: [L2, T], createdBy: L2 })
  await seedGroup('r2', { members: [G2.uid, T], createdBy: G2.uid })
  const p = await post('bindIdentity', { provider: 'line', liffIdToken: L2 }, G2.idToken)
  assert.equal(p.body.status, 'merge_required')
  const results = await Promise.all([
    post('executeMerge', { mergeId: p.body.mergeId }, G2.idToken),
    post('executeMerge', { mergeId: p.body.mergeId }, G2.idToken),
  ])
  const statuses = results.map((r) => r.status).sort()
  assert.ok(statuses.includes(200), JSON.stringify(results.map((r) => r.body)))
  assert.ok(statuses.every((s) => s === 200 || s === 409), statuses.join())
  assert.equal((await db.doc(`merges/${p.body.mergeId}`).get()).data().state, 'done')
  // 兩邊各 1 個群組，一樣多時保留發起人（G2），L2 被併入
  assert.equal(p.body.initiatorIsDropped, false)
  assert.deepEqual((await db.doc('groups/r1').get()).data().members, [G2.uid, T])
  assert.deepEqual((await db.doc('groups/r2').get()).data().members, [G2.uid, T])
  const lineAfter = await post('verifyLiffToken', { idToken: L2 })
  assert.equal(lineAfter.body.uid, G2.uid) // 被併入的 LINE 之後登入的是保留的帳號
})

test('刪除帳號：對照項、合併紀錄與備份一併清除', async () => {
  const del = await post('detachMember', { groupIds: [], deleteAccount: true }, S.Lnew)
  assert.equal(del.status, 200, JSON.stringify(del.body))
  assert.deepEqual([del.body.accountDeleted, del.body.failed], [true, []])
  assert.equal((await db.collection('identities').where('uid', '==', S.L).get()).size, 0)
  assert.equal((await db.collection('merges').where('uids', 'array-contains', S.L).get()).size, 0)
  assert.equal((await db.collection('mergeBackups').where('uids', 'array-contains', S.L).get()).size, 0)
})
