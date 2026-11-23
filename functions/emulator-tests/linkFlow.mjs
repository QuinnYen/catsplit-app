// linkFlow.js 的 Firestore 整合測試：一次性連結碼的產生、兌換、過期、單次有效、清除。
// 需要 Firestore 模擬器，用 npm run test:merge 執行。
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createLinkCode, redeemLinkCode, deleteLinkCodesOf } from '../linkFlow.js'
import { hashLinkCode, generateLinkCode, LINK_CODE_TTL_MS } from '../linkCode.js'
import { purgeExpired } from '../mergeFlow.js'

let db
before(() => {
  initializeApp({ projectId: 'demo-catsplit-linkflow' })
  db = getFirestore()
})

const NOW = 1_800_000_000_000
const errorOf = async (promise) => {
  try { await promise } catch (e) { return e }
  assert.fail('expected an error')
}
const seedUser = (uid) => db.doc(`users/${uid}`).set({ name: 'N' })

test('createLinkCode：回傳 43 字元的碼與到期時間，資料庫只存雜湊，不存明碼', async () => {
  const uid = 'U' + '1'.repeat(32)
  await seedUser(uid)
  const { code, expiresAtMs } = await createLinkCode(db, { uid, nowMs: NOW })
  assert.match(code, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(expiresAtMs, NOW + LINK_CODE_TTL_MS)
  const snap = await db.doc(`linkCodes/${hashLinkCode(code)}`).get()
  assert.equal(snap.exists, true)
  assert.equal(snap.data().uid, uid)
  assert.equal(JSON.stringify(snap.data()).includes(code), false)
  assert.equal((await db.doc(`linkCodes/${code}`).get()).exists, false)
})

test('createLinkCode：同一個帳號同時只留一個有效的碼，產生新的舊的就失效', async () => {
  const uid = 'U' + '2'.repeat(32)
  await seedUser(uid)
  const first = await createLinkCode(db, { uid, nowMs: NOW })
  const second = await createLinkCode(db, { uid, nowMs: NOW + 1000 })
  assert.equal((await db.collection('linkCodes').where('uid', '==', uid).get()).size, 1)
  assert.equal((await errorOf(redeemLinkCode(db, { code: first.code, nowMs: NOW + 2000 }))).code, 'link_invalid')
  assert.deepEqual(await redeemLinkCode(db, { code: second.code, nowMs: NOW + 2000 }), { uid })
})

test('redeemLinkCode：兌換成功回傳 uid，紀錄被刪，第二次兌換無效（只能用一次）', async () => {
  const uid = 'U' + '3'.repeat(32)
  await seedUser(uid)
  const { code } = await createLinkCode(db, { uid, nowMs: NOW })
  assert.deepEqual(await redeemLinkCode(db, { code, nowMs: NOW + 1000 }), { uid })
  assert.equal((await db.doc(`linkCodes/${hashLinkCode(code)}`).get()).exists, false)
  const again = await errorOf(redeemLinkCode(db, { code, nowMs: NOW + 2000 }))
  assert.deepEqual([again.code, again.status], ['link_invalid', 404])
})

test('redeemLinkCode：同一個碼同時兌換多次，只有一次成功', async () => {
  const uid = 'U' + '4'.repeat(32)
  await seedUser(uid)
  const { code } = await createLinkCode(db, { uid, nowMs: NOW })
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => redeemLinkCode(db, { code, nowMs: NOW + 1000 })))
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'link_invalid'))
})

test('redeemLinkCode：逾時回 410 link_expired；格式不對或不存在回 404 link_invalid', async () => {
  const uid = 'U' + '5'.repeat(32)
  await seedUser(uid)
  const { code } = await createLinkCode(db, { uid, nowMs: NOW })
  const late = await errorOf(redeemLinkCode(db, { code, nowMs: NOW + LINK_CODE_TTL_MS }))
  assert.deepEqual([late.code, late.status], ['link_expired', 410])
  for (const bad of [undefined, '', 'short', 'x'.repeat(43) + '!', generateLinkCode()]) {
    const e = await errorOf(redeemLinkCode(db, { code: bad, nowMs: NOW }))
    assert.deepEqual([e.code, e.status], ['link_invalid', 404], String(bad))
  }
})

test('redeemLinkCode：帳號已不存在（users 文件被刪，例如剛被併掉）時無效，不會建出空帳號', async () => {
  const uid = 'U' + '6'.repeat(32)
  const { code } = await createLinkCode(db, { uid, nowMs: NOW }) // 沒有 users 文件
  const e = await errorOf(redeemLinkCode(db, { code, nowMs: NOW + 1000 }))
  assert.equal(e.code, 'link_invalid')
  assert.equal((await db.doc(`linkCodes/${hashLinkCode(code)}`).get()).exists, false) // 碼已被消耗
})

test('purgeExpired 也清除過期的連結碼；deleteLinkCodesOf 刪除帳號時清掉未兌換的碼', async () => {
  await db.doc('linkCodes/old').set({ uid: 'x', expireAtMs: 1000 })
  await db.doc('linkCodes/fresh').set({ uid: 'x', expireAtMs: NOW + 1000 })
  const deleted = await purgeExpired(db, NOW)
  assert.ok(deleted.includes('linkCodes/old'))
  assert.equal((await db.doc('linkCodes/old').get()).exists, false)
  assert.equal((await db.doc('linkCodes/fresh').get()).exists, true)

  const uid = 'U' + '7'.repeat(32)
  await seedUser(uid)
  const { code } = await createLinkCode(db, { uid, nowMs: NOW })
  await deleteLinkCodesOf(db, uid)
  assert.equal((await db.doc(`linkCodes/${hashLinkCode(code)}`).get()).exists, false)
  assert.equal((await db.doc('linkCodes/fresh').get()).exists, true)
})
