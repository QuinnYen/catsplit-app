// migrateLegacyUid（舊 LINE uid 轉成內部 uid）的 Firestore 整合測試：資料搬移、對照項、備份、重試、已轉完不重做。
// 需要 Firestore 模擬器，用 npm run test:merge 執行。
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { migrateLegacyUid, legacyMigrationId } from '../mergeFlow.js'
import { checkAggregates } from '../aggregateCheck.js'
import { computeGroupAggregates } from '../../src/utils/expenseHelpers.js'
import { MergeError } from '../bind.js'

let db
before(async () => {
  initializeApp({ projectId: 'demo-catsplit-uidmig' })
  db = getFirestore()
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-catsplit-uidmig/databases/(default)/documents', { method: 'DELETE' })
})

const NOW = 1_800_000_000_000
const hex = (c) => 'U' + c.repeat(32)
let counter = 0
const makeUid = () => `u_${String(++counter).padStart(20, '0')}`
const makeDeps = (extra = {}) => {
  const deleted = []
  return { deleted, makeUid, deleteAuthUser: async (uid) => { deleted.push(uid) }, nowMs: () => NOW, ...extra }
}
const errorOf = async (p) => { try { await p } catch (e) { return e } assert.fail('expected an error') }

// 舊使用者 L：兩個群組（一個和 T 一起、一個只有自己）、個人資料、LINE 與 Google 兩個對照項
const seed = async (tag) => {
  const L = hex(tag)
  const T = hex(tag === 'a' ? 'b' : 'e')
  const guest = `p_${tag}guest`
  const expenses = [
    { amount: 100, payments: { [L]: 100 }, splits: { [L]: 50, [T]: 50 }, createdBy: L },
    { amount: 40, payments: { [T]: 40 }, splits: { [L]: 10, [T]: 10, [guest]: 20 }, createdBy: T },
  ]
  const settlements = [{ from: T, to: L, amount: 5, settledBy: T }]
  const members1 = [L, T, guest]
  const agg1 = computeGroupAggregates(members1, expenses, settlements, [])
  await db.doc(`groups/${tag}g1`).set({
    name: 'G1', members: members1, createdBy: L, baseCurrency: 'TWD',
    memberProfiles: { [L]: { name: 'L', avatar: null }, [T]: { name: 'T' }, [guest]: { name: 'Guest', placeholder: true } }, ...agg1,
  })
  for (const [i, e] of expenses.entries()) await db.doc(`groups/${tag}g1/expenses/e${i}`).set(e)
  await db.doc(`groups/${tag}g1/settlements/s0`).set(settlements[0])
  const solo = [{ amount: 9, payments: { [L]: 9 }, splits: { [L]: 9 }, createdBy: L }]
  await db.doc(`groups/${tag}g2`).set({ name: 'G2', members: [L], createdBy: L, memberProfiles: { [L]: { name: 'L' } }, ...computeGroupAggregates([L], solo) })
  await db.doc(`groups/${tag}g2/expenses/e0`).set(solo[0])
  await db.doc(`users/${L}`).set({ name: 'Line Name', avatar: 'https://example.com/l.png' })
  await db.doc(`users/${L}/settings/profile`).set({ nickname: 'Nick' })
  await db.doc(`users/${L}/paymentMethods/pm1`).set({ providerId: 'bank', value: '123', isPublic: true })
  await db.doc(`users/${L}/savingsGoals/sg1`).set({ title: 'trip' })
  await db.doc(`users/${L}/savingsGoals/sg1/entries/en1`).set({ type: 'save', amount: 5 })
  await db.doc(`identities/line:${L}`).set({ uid: L, provider: 'line', subject: L })
  await db.doc(`identities/google:g-${tag}`).set({ uid: L, provider: 'google', subject: `g-${tag}` })
  return { L, T, guest }
}

test('舊 LINE 使用者轉成內部 uid：群組、帳目、個人資料、對照項、users 文件、Auth、備份都正確，彙總仍然一致', async () => {
  const { L, T, guest } = await seed('a')
  const deps = makeDeps()
  const r = await migrateLegacyUid(db, deps, { oldUid: L })
  assert.equal(r.status, 'migrated')
  const N = r.newUid
  assert.match(N, /^u_[0-9]{20}$/)
  assert.deepEqual(deps.deleted, [L])

  // 群組：成員、建立者、成員資料、餘額與筆數的 key 都換成新 uid，其他成員與訪客不動
  const g1 = (await db.doc('groups/ag1').get()).data()
  assert.deepEqual(g1.members, [N, T, guest])
  assert.equal(g1.createdBy, N)
  assert.deepEqual(Object.keys(g1.memberProfiles).sort(), [N, T, guest].sort())
  assert.equal(g1.memberProfiles[guest].placeholder, true)
  assert.ok(!(L in g1.memberBalances) && N in g1.memberBalances)
  const g2 = (await db.doc('groups/ag2').get()).data()
  assert.deepEqual([g2.members, g2.createdBy], [[N], N])

  // 帳目與轉帳：uid 欄位與 map 的 key 換成新 uid，金額不變
  const e0 = (await db.doc('groups/ag1/expenses/e0').get()).data()
  assert.deepEqual([e0.payments, e0.splits, e0.createdBy], [{ [N]: 100 }, { [N]: 50, [T]: 50 }, N])
  const s0 = (await db.doc('groups/ag1/settlements/s0').get()).data()
  assert.deepEqual([s0.from, s0.to, s0.amount], [T, N, 5])

  // 整批重算後的彙總與存的一致（餘額沒有因為換 uid 而變）
  const check = await checkAggregates(db, { computeAggregates: computeGroupAggregates, groupId: 'ag1' })
  const check2 = await checkAggregates(db, { computeAggregates: computeGroupAggregates, groupId: 'ag2' })
  assert.deepEqual([check.mismatched.length, check2.mismatched.length], [0, 0])

  // 個人資料搬到新 uid，舊的清空；users 文件搬名稱與頭像
  assert.equal((await db.doc(`users/${N}/settings/profile`).get()).data().nickname, 'Nick')
  assert.equal((await db.doc(`users/${N}/paymentMethods/pm1`).get()).data().value, '123')
  assert.equal((await db.doc(`users/${N}/savingsGoals/sg1/entries/en1`).get()).data().amount, 5)
  assert.deepEqual(await db.doc(`users/${L}`).listCollections(), [])
  assert.equal((await db.doc(`users/${L}`).get()).exists, false)
  const userDoc = (await db.doc(`users/${N}`).get()).data()
  assert.deepEqual([userDoc.name, userDoc.avatar, userDoc.provider], ['Line Name', 'https://example.com/l.png', null])
  assert.equal(userDoc.names.line, 'Line Name')

  // 兩個對照項都指向新 uid；再登入會查到新 uid
  assert.equal((await db.doc(`identities/line:${L}`).get()).data().uid, N)
  assert.equal((await db.doc(`identities/google:g-a`).get()).data().uid, N)

  // 備份與進度紀錄
  const rec = (await db.doc(`merges/${legacyMigrationId(L)}`).get()).data()
  assert.deepEqual([rec.kind, rec.state, rec.keepUid, rec.dropUid], ['uid_migration', 'done', N, L])
  assert.ok(rec.expireAtMs > NOW)
  const backup = (await db.doc(`mergeBackups/${legacyMigrationId(L)}`).get()).data()
  assert.deepEqual([backup.dropUid, backup.keepUid], [L, N])
  assert.ok(backup.counts.groupDocs >= 5 && backup.counts.personal >= 4)
  assert.equal(backup.dropUserDoc.name, 'Line Name')
})

test('已轉完的再跑一次：不做任何事，也不會再刪 Auth', async () => {
  const L = hex('a')
  const deps = makeDeps()
  const r = await migrateLegacyUid(db, deps, { oldUid: L })
  assert.deepEqual([r.status, deps.deleted], ['already_done', []])
})

test('中途失敗後重跑：沿用同一個新 uid，從中斷處繼續，備份不會重做', async () => {
  const { L, T } = await seed('c')
  let failed = false
  const flaky = makeDeps({ hook: async (stage) => { if (stage === 'groups_done' && !failed) { failed = true; throw new MergeError('boom', 500) } } })
  const err = await errorOf(migrateLegacyUid(db, flaky, { oldUid: L }))
  assert.equal(err.code, 'boom')
  const mid = (await db.doc(`merges/${legacyMigrationId(L)}`).get()).data()
  assert.equal(mid.state, 'started')
  assert.equal(mid.backupDone, true)
  const backupMeta = (await db.doc(`mergeBackups/${legacyMigrationId(L)}`).get()).data()
  // 此時群組已經搬完、個人資料還沒搬、舊帳號還在
  assert.deepEqual((await db.doc('groups/cg1').get()).data().members.includes(L), false)
  assert.equal((await db.doc(`users/${L}`).get()).exists, true)
  assert.deepEqual(flaky.deleted, [])

  const deps = makeDeps({ nowMs: () => NOW + 60_000 })
  const r = await migrateLegacyUid(db, deps, { oldUid: L })
  assert.equal(r.status, 'migrated')
  assert.equal(r.newUid, mid.keepUid) // 沿用第一次決定的新 uid
  assert.deepEqual(deps.deleted, [L])
  assert.deepEqual((await db.doc(`mergeBackups/${legacyMigrationId(L)}`).get()).data(), backupMeta) // 備份只做一次
  assert.equal((await db.doc(`users/${r.newUid}/settings/profile`).get()).data().nickname, 'Nick')
  assert.equal((await checkAggregates(db, { computeAggregates: computeGroupAggregates, groupId: 'cg1' })).mismatched.length, 0)
  assert.ok(T)
})

test('還沒有對照項的舊使用者也能轉，並補建 LINE 對照項指向新 uid', async () => {
  const { L } = await seed('d')
  await db.doc(`identities/line:${L}`).delete()
  const r = await migrateLegacyUid(db, makeDeps(), { oldUid: L })
  assert.equal(r.status, 'migrated')
  assert.equal((await db.doc(`identities/line:${L}`).get()).data().uid, r.newUid)
})

test('不是舊 LINE uid、已被處理掉、或有進行中的其他合併：不動資料', async () => {
  assert.equal((await errorOf(migrateLegacyUid(db, makeDeps(), { oldUid: 'u_00000000000000000099' }))).code, 'not_legacy_uid')
  assert.equal((await errorOf(migrateLegacyUid(db, makeDeps(), { oldUid: 'p_abc' }))).code, 'not_legacy_uid')

  // 對照項已指向別的 uid（例如先前的帳號合併已處理），也沒有轉移紀錄
  const X = hex('9')
  await db.doc(`identities/line:${X}`).set({ uid: 'u_00000000000000000042', provider: 'line', subject: X })
  assert.deepEqual(await migrateLegacyUid(db, makeDeps(), { oldUid: X }), { status: 'already_migrated', oldUid: X, newUid: 'u_00000000000000000042' })

  // 有進行中的合併：拒絕，而且沒有建立轉移紀錄
  const { L } = await seed('f')
  await db.doc('merges/other').set({ uids: [L, 'u_00000000000000000077'], state: 'started', keepUid: 'u_00000000000000000077', dropUid: L })
  const err = await errorOf(migrateLegacyUid(db, makeDeps(), { oldUid: L }))
  assert.deepEqual([err.code, err.status], ['other_merge_in_progress', 409])
  assert.equal((await db.doc(`merges/${legacyMigrationId(L)}`).get()).exists, false)
  assert.equal((await db.doc('groups/fg1').get()).data().members.includes(L), true)
})
