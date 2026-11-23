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

test('Google 先登入、LINE 帳號有資料：兩邊各自登入，uid 都是內部 uid', async () => {
  S.L = 'U' + 'e'.repeat(32) // LINE userId（不是 uid）
  S.G = await googleLogin('ge2e')
  S.Lg = await lineLogin(S.L)
  S.Lu = S.Lg.uid // LINE 帳號的內部 uid
  assert.match(S.G.uid, /^u_[0-9a-f]{20}$/)
  assert.match(S.Lu, /^u_[0-9a-f]{20}$/)
  assert.equal(S.Lg.userId, S.L) // 回應仍帶 LINE userId
  const L = S.Lu
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
  await seedGroup('eGuest', { members: [S.Lu], createdBy: S.Lu })
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
  assert.deepEqual([r.body.ok, r.body.keepUid, r.body.sessionReplaced, r.body.alreadyDone], [true, S.Lu, true, false])
  // 保留帳號（LINE 舊使用者）的名稱與頭像，前端用來重建登入狀態
  assert.equal(r.body.profile.name, `Mock ${S.L.slice(0, 6)}`)
  assert.equal(r.body.profile.avatar, 'https://example.com/avatar.png')
  assert.equal(r.body.profile.provider, null)
  const newToken = await signIn(r.body.firebaseToken)
  assert.equal(uidOfToken(newToken), S.Lu)
  S.Lnew = newToken

  // 舊的 Google 帳號（被併入）已從 Auth 刪除
  const lookup = await fetch(`${AUTH}/accounts:lookup?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ idToken: S.G.idToken }) })
  assert.notEqual(lookup.status, 200)

  const L = S.Lu
  const G = S.G.uid
  const both = (await db.doc('groups/eBoth').get()).data()
  assert.deepEqual([...both.members].sort(), [L, T].sort())
  assert.equal((await db.doc('groups/eBoth/settlements/s1').get()).exists, false)
  assert.deepEqual((await db.doc('groups/e3').get()).data().members, [L, T])
  assert.equal((await db.doc(`users/${L}/paymentMethods/pmG`).get()).data().value, '222')
  assert.equal((await db.doc(`users/${L}/settings/profile`).get()).data().nickname, 'LNick')
  assert.equal((await db.doc(`users/${G}`).get()).exists, false)
  assert.equal((await db.doc('identities/google:ge2e').get()).data().uid, L)
  assert.equal((await db.doc(`identities/line:${S.L}`).get()).data().uid, L)
  assert.equal((await db.doc(`mergeBackups/${S.mergeId}`).get()).data().counts.groupDocs > 0, true)

  // 重複呼叫（例如網路重送）直接回結果
  const again = await post('executeMerge', { mergeId: S.mergeId }, newToken)
  assert.equal(again.status, 403) // 新 session 的 uid 是 L，不是發起人 G
  const retryOld = await post('executeMerge', { mergeId: S.mergeId }, S.G.idToken)
  assert.notEqual(retryOld.status, 200) // 舊 session 已失效
})

test('合併後兩種方式登入都進同一個帳號，不是新帳號', async () => {
  const g = await post('authExchange', { provider: 'google', idToken: 'ge2e' })
  assert.deepEqual([g.body.uid, g.body.isNew], [S.Lu, false])
  const l = await post('verifyLiffToken', { idToken: S.L })
  assert.equal(l.body.uid, S.Lu)
})

test('listIdentities 與 unbindIdentity：解除 Google 後，這個 Google 再登入會是新的帳號', async () => {
  const list = await post('listIdentities', {}, S.Lnew)
  assert.deepEqual(list.body.identities.map((i) => i.provider).sort(), ['google', 'line'])
  const google = list.body.identities.find((i) => i.provider === 'google')
  const un = await post('unbindIdentity', { identityId: google.id }, S.Lnew)
  assert.deepEqual([un.status, un.body], [200, { ok: true }])
  const fresh = await post('authExchange', { provider: 'google', idToken: 'ge2e' })
  assert.equal(fresh.body.isNew, true)
  assert.notEqual(fresh.body.uid, S.Lu)
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
  assert.deepEqual([done.status, done.body.keepUid, done.body.sessionReplaced], [200, S.Lu, false])
  assert.equal((await db.doc('identities/google:ge2e').get()).data().uid, S.Lu)
  assert.equal((await db.doc(`users/${S.fresh}`).get()).exists, false)
})

test('同一個合併同時執行兩次：只有一次真的執行，另一次被擋（租約）', async () => {
  const G2 = await googleLogin('ge2e-race')
  const L2 = 'U' + 'c'.repeat(32)
  const l2 = await lineLogin(L2)
  await seedGroup('r1', { members: [l2.uid, T], createdBy: l2.uid })
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

test('LINE 內綁定 Google：產生一次性連結碼 → 外部瀏覽器兌換成同一個帳號的登入 → 用外部瀏覽器的 Google 綁定', async () => {
  const L3 = 'U' + '3'.repeat(32)
  const line = await lineLogin(L3)
  assert.equal((await post('createLinkCode', {})).status, 401) // 未登入不能產生

  const first = await post('createLinkCode', {}, line.idToken)
  assert.equal(first.status, 200, JSON.stringify(first.body))
  assert.match(first.body.code, /^[A-Za-z0-9_-]{43}$/)
  const made = await post('createLinkCode', {}, line.idToken) // 再產生一個，前一個失效
  assert.equal((await post('redeemLinkCode', { code: first.body.code })).status, 404)

  // 兌換不需要登入（外部瀏覽器還沒登入）
  const redeemed = await post('redeemLinkCode', { code: made.body.code })
  assert.equal(redeemed.status, 200, JSON.stringify(redeemed.body))
  assert.equal(redeemed.body.uid, line.uid)
  assert.equal(redeemed.body.profile.name, `Mock ${L3.slice(0, 6)}`)
  const extToken = await signIn(redeemed.body.firebaseToken)
  assert.equal(uidOfToken(extToken), line.uid)

  // 只能用一次；格式不對也是無效
  const again = await post('redeemLinkCode', { code: made.body.code })
  assert.deepEqual([again.status, again.body.error], [404, 'link_invalid'])
  assert.equal((await post('redeemLinkCode', { code: 'x' })).status, 404)
  assert.equal((await post('redeemLinkCode', {})).status, 404)

  // 用兌換得到的登入狀態，在外部瀏覽器以 Google 綁定，綁到同一個帳號
  const bound = await post('bindIdentity', { provider: 'google', idToken: 'g-link' }, extToken)
  assert.deepEqual([bound.status, bound.body], [200, { status: 'bound' }])
  assert.equal((await db.doc('identities/google:g-link').get()).data().uid, line.uid)
  assert.equal((await googleLogin('g-link')).uid, line.uid) // 之後用 Google 登入進的也是這個 LINE 帳號
})

test('刪除帳號：對照項、合併紀錄與備份一併清除', async () => {
  const del = await post('detachMember', { groupIds: [], deleteAccount: true }, S.Lnew)
  assert.equal(del.status, 200, JSON.stringify(del.body))
  assert.deepEqual([del.body.accountDeleted, del.body.failed], [true, []])
  assert.equal((await db.collection('identities').where('uid', '==', S.Lu).get()).size, 0)
  assert.equal((await db.collection('merges').where('uids', 'array-contains', S.Lu).get()).size, 0)
  assert.equal((await db.collection('mergeBackups').where('uids', 'array-contains', S.Lu).get()).size, 0)
})

// 名稱、頭像、provider：每個登入方式各存一份，顯示用的 LINE 優先，不會因為最後登入的是誰而改變
test('Google 單獨登入：用 Google 的名稱與頭像，provider 是 google（要先設定暱稱）', async () => {
  const g = await googleLogin('gavatar1')
  assert.deepEqual([g.name, g.avatar, g.provider], ['Google gavatar1', 'https://example.com/google.png', 'google'])
})

test('LINE 帳號綁定 Google 後用 Google 登入：仍是 LINE 的名稱與頭像，provider 清空，users 文件各存一份', async () => {
  const L = 'U' + '7'.repeat(32)
  const line = await lineLogin(L)
  assert.equal(line.pictureUrl, 'https://example.com/avatar.png')
  const bind = await post('bindIdentity', { provider: 'google', idToken: 'gavatar2' }, line.idToken)
  assert.deepEqual([bind.status, bind.body.status], [200, 'bound'])
  const viaGoogle = await googleLogin('gavatar2')
  assert.equal(viaGoogle.uid, line.uid)
  assert.deepEqual([viaGoogle.name, viaGoogle.avatar, viaGoogle.provider], [`Mock ${L.slice(0, 6)}`, 'https://example.com/avatar.png', null])
  assert.equal(viaGoogle.displayName, 'Google gavatar2') // Google 上的名字另外保留
  const doc = (await db.doc(`users/${line.uid}`).get()).data()
  assert.deepEqual(doc.names, { line: `Mock ${L.slice(0, 6)}`, google: 'Google gavatar2' })
  assert.deepEqual(doc.avatars, { line: 'https://example.com/avatar.png', google: 'https://example.com/google.png' })
  assert.deepEqual([doc.name, doc.avatar, doc.provider], [`Mock ${L.slice(0, 6)}`, 'https://example.com/avatar.png', null])
})

test('合併後保留的是 Google 帳號：被併入的 LINE 帳號的名稱與頭像併進來，provider 清空', async () => {
  const L = 'U' + '6'.repeat(32)
  const lineLogged = await lineLogin(L)
  const g = await googleLogin('gavatar3')
  assert.equal(g.provider, 'google')
  await seedGroup('av1', { members: [g.uid, T], createdBy: g.uid })
  await seedGroup('av2', { members: [g.uid, T], createdBy: g.uid })
  await seedGroup('av3', { members: [lineLogged.uid, T], createdBy: T })
  const bind = await post('bindIdentity', { provider: 'line', liffIdToken: L }, g.idToken)
  assert.equal(bind.body.status, 'merge_required', JSON.stringify(bind.body))
  assert.equal(bind.body.keepUid ?? g.uid, g.uid)
  const done = await post('executeMerge', { mergeId: bind.body.mergeId, resolutions: {} }, g.idToken)
  assert.equal(done.status, 200, JSON.stringify(done.body))
  assert.equal(done.body.keepUid, g.uid)
  assert.deepEqual([done.body.profile.name, done.body.profile.avatar, done.body.profile.provider], [`Mock ${L.slice(0, 6)}`, 'https://example.com/avatar.png', null])
})

// 刪除群組：後端 recursiveDelete，帳目超過 500 筆也刪得掉（客戶端單一 writeBatch 的上限）；只有建立者能刪
test('deleteGroup：只有建立者能刪；帳目超過 500 筆也整個刪掉；重試安全；訪客與未登入被拒', async () => {
  const owner = await googleLogin('gdel1')
  const other = await googleLogin('gdel2')
  const gid = 'delgroup1'
  await seedGroup(gid, { members: [owner.uid, other.uid], createdBy: owner.uid })
  for (let i = 0; i < 6; i++) {
    const batch = db.batch()
    for (let j = 0; j < 100; j++) batch.set(db.collection(`groups/${gid}/expenses`).doc(`x${i}_${j}`), { amount: 1, payments: { [owner.uid]: 1 }, splits: { [owner.uid]: 1 } })
    await batch.commit()
  }
  await db.doc(`groups/${gid}/settlements/s1`).set({ from: owner.uid, to: other.uid, amount: 1 })
  await db.doc(`groups/${gid}/incomes/i1`).set({ amount: 1 })
  assert.equal((await db.collection(`groups/${gid}/expenses`).get()).size, 600)

  assert.equal((await post('deleteGroup', { groupId: gid })).status, 401)
  assert.equal((await post('deleteGroup', { groupId: gid }, other.idToken)).status, 403)
  assert.equal((await post('deleteGroup', { groupId: 'bad/id' }, owner.idToken)).status, 400)
  assert.equal((await db.doc(`groups/${gid}`).get()).exists, true)

  const r = await post('deleteGroup', { groupId: gid }, owner.idToken)
  assert.deepEqual([r.status, r.body.ok], [200, true], JSON.stringify(r.body))
  assert.equal((await db.doc(`groups/${gid}`).get()).exists, false)
  assert.equal((await db.collection(`groups/${gid}/expenses`).get()).size, 0)
  assert.equal((await db.collection(`groups/${gid}/settlements`).get()).size, 0)
  assert.equal((await db.collection(`groups/${gid}/incomes`).get()).size, 0)
  // 已經不存在：視為成功
  assert.equal((await post('deleteGroup', { groupId: gid }, owner.idToken)).status, 200)
})

// 新 LINE 使用者用內部 uid；舊使用者沿用 LINE userId；舊使用者轉移之後再登入拿到新 uid
test('LINE 登入的 uid：全新的使用者拿到內部 uid（u_），回應仍帶 LINE userId，再登入還是同一個', async () => {
  const fresh = await lineLogin('U' + '5'.repeat(32))
  assert.match(fresh.uid, /^u_[0-9a-f]{20}$/)
  assert.equal(fresh.userId, 'U' + '5'.repeat(32)) // 回應仍帶 LINE userId
  assert.equal((await lineLogin('U' + '5'.repeat(32))).uid, fresh.uid) // 同一個人再登入還是同一個
})
