// ledgerOps.js 的 Firestore 整合測試：刪除整個帳本子樹、不碰別的帳本與別人的資料、冪等、刪除所有帳本。
// 需要 Firestore 模擬器，用 npm run test:merge 執行。
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { deleteLedgerTree, deleteAllLedgers, isValidLedgerId } from '../ledgerOps.js'

let db
before(async () => {
  initializeApp({ projectId: 'demo-catsplit-ledgerops' })
  db = getFirestore()
})
beforeEach(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-catsplit-ledgerops/databases/(default)/documents', { method: 'DELETE' })
})

const seedLedger = async (uid, id, txCount = 3) => {
  const ref = db.doc(`users/${uid}/ledgers/${id}`)
  await ref.set({ name: id, baseCurrency: 'TWD' })
  await ref.collection('accounts').doc('a1').set({ name: '現金' })
  await ref.collection('groupLinks').doc('g1').set({ groupName: 'G' })
  for (let i = 0; i < txCount; i++) await ref.collection('transactions').doc(`t${i}`).set({ amount: i + 1 })
  return ref
}
const exists = async (path) => (await db.doc(path).get()).exists
const count = async (path) => (await db.collection(path).get()).size

test('deleteLedgerTree：刪除帳本文件與所有子集合，不碰別的帳本與別人的資料', async () => {
  await seedLedger('u1', 'l1')
  await seedLedger('u1', 'l2')
  await seedLedger('u2', 'l1')
  await deleteLedgerTree(db, 'u1', 'l1')
  assert.equal(await exists('users/u1/ledgers/l1'), false)
  assert.equal(await count('users/u1/ledgers/l1/transactions'), 0)
  assert.equal(await count('users/u1/ledgers/l1/accounts'), 0)
  assert.equal(await count('users/u1/ledgers/l1/groupLinks'), 0)
  assert.equal(await exists('users/u1/ledgers/l2'), true)
  assert.equal(await count('users/u1/ledgers/l2/transactions'), 3)
  assert.equal(await exists('users/u2/ledgers/l1'), true)
  assert.equal(await count('users/u2/ledgers/l1/transactions'), 3)
})

test('deleteLedgerTree：超過 500 筆帳目也能刪（客戶端單一 batch 做不到）', async () => {
  const ref = db.doc('users/u1/ledgers/big')
  await ref.set({ name: 'big' })
  const writer = db.bulkWriter()
  for (let i = 0; i < 650; i++) writer.set(ref.collection('transactions').doc(`t${i}`), { amount: 1 })
  await writer.close()
  assert.equal(await count('users/u1/ledgers/big/transactions'), 650)
  await deleteLedgerTree(db, 'u1', 'big')
  assert.equal(await count('users/u1/ledgers/big/transactions'), 0)
  assert.equal(await exists('users/u1/ledgers/big'), false)
})

test('deleteLedgerTree：帳本不存在視為成功（重試安全）', async () => {
  await deleteLedgerTree(db, 'u1', 'nope')
  await seedLedger('u1', 'l1')
  await deleteLedgerTree(db, 'u1', 'l1')
  await deleteLedgerTree(db, 'u1', 'l1')
  assert.equal(await exists('users/u1/ledgers/l1'), false)
})

test('deleteLedgerTree：只有「帳本文件不存在、但子集合還在」的殘留也會被清掉', async () => {
  const ref = db.doc('users/u1/ledgers/orphan')
  await ref.collection('transactions').doc('t1').set({ amount: 1 })
  await deleteLedgerTree(db, 'u1', 'orphan')
  assert.equal(await count('users/u1/ledgers/orphan/transactions'), 0)
})

test('deleteLedgerTree：不合法的帳本 id 會被拒絕（避免路徑跳脫）', async () => {
  for (const bad of ['', 'a/b', '../x', 'a b', 'x'.repeat(41), undefined, null, 123]) {
    await assert.rejects(() => deleteLedgerTree(db, 'u1', bad), /invalid ledger id/)
    assert.equal(isValidLedgerId(bad), false)
  }
  assert.equal(isValidLedgerId('default'), true)
  assert.equal(isValidLedgerId('AbC_123-x'), true)
})

test('deleteAllLedgers：刪除這個人所有帳本，別人的不動；沒有帳本也成功', async () => {
  await deleteAllLedgers(db, 'u1')
  await seedLedger('u1', 'l1')
  await seedLedger('u1', 'l2')
  await seedLedger('u2', 'l1')
  await db.doc('users/u1/settings/profile').set({ nickname: 'x' })
  await deleteAllLedgers(db, 'u1')
  assert.equal(await count('users/u1/ledgers'), 0)
  assert.equal(await exists('users/u1/ledgers/l1'), false)
  assert.equal(await count('users/u1/ledgers/l2/transactions'), 0)
  assert.equal(await exists('users/u2/ledgers/l1'), true)
  assert.equal(await exists('users/u1/settings/profile'), true) // 只刪帳本，其他個人資料由別處處理
})
