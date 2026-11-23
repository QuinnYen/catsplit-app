// aggregateCheck.js 的 Firestore 整合測試：找出彙總對不上的群組、修復、掃描與寫入之間被改過就跳過。
// 需要 Firestore 模擬器，用 npm run test:merge 執行。重算用客戶端同一份 computeGroupAggregates。
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { checkAggregates } from '../aggregateCheck.js'
import { computeGroupAggregates } from '../../src/utils/expenseHelpers.js'

let db
before(async () => {
  initializeApp({ projectId: 'demo-catsplit-aggcheck' })
  db = getFirestore()
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-catsplit-aggcheck/databases/(default)/documents', { method: 'DELETE' })
})

const A = 'U' + 'a'.repeat(32)
const B = 'U' + 'b'.repeat(32)
const expenses = [
  { amount: 100, payments: { [A]: 100 }, splits: { [A]: 50, [B]: 50 } },
  { amount: 30, payments: { [B]: 30 }, splits: { [A]: 15, [B]: 15 } },
]
const settlements = [{ from: B, to: A, amount: 10 }]
const incomes = [{ amount: 20, received: { [A]: 20 }, splits: { [A]: 10, [B]: 10 } }]

const seed = async (id, over = {}) => {
  const ref = db.doc(`groups/${id}`)
  const correct = computeGroupAggregates([A, B], expenses, settlements, incomes)
  await ref.set({ name: `G ${id}`, members: [A, B], createdBy: A, ...correct, ...over })
  for (const [col, list] of [['expenses', expenses], ['settlements', settlements], ['incomes', incomes]]) {
    for (const [i, d] of list.entries()) await ref.collection(col).doc(`${col}${i}`).set(d)
  }
  return ref
}
const run = (opts) => checkAggregates(db, { computeAggregates: computeGroupAggregates, ...opts })

test('一致的群組不會被列出；舊群組沒有 totalIncome 等欄位而帳目也沒有收入時視為一致', async () => {
  await seed('ok1')
  const ref = db.doc('groups/old1')
  await ref.set({ name: 'old', members: [A], createdBy: A, totalAmount: 0, totalExpenses: 0, memberBalances: { [A]: 0 }, memberExpenseCounts: {} })
  const r = await run({ groupId: 'ok1' })
  assert.deepEqual([r.scanned, r.mismatched.length], [1, 0])
  assert.equal((await run({ groupId: 'old1' })).mismatched.length, 0)
})

test('dry-run：列出對不上的欄位與數值，不寫入任何資料', async () => {
  const ref = await seed('bad1', { totalExpenses: 5, memberBalances: { [A]: 999, [B]: -1 } })
  const before = (await ref.get()).data()
  const r = await run({ groupId: 'bad1' })
  assert.equal(r.mismatched.length, 1)
  const fields = r.mismatched[0].diffs.map((d) => `${d.field}${d.key ? `:${d.key.slice(0, 3)}` : ''}`)
  assert.deepEqual(fields.sort(), ['memberBalances:Uaa', 'memberBalances:Ubb', 'totalExpenses'].sort())
  assert.equal(r.mismatched[0].outcome, 'found')
  assert.deepEqual((await ref.get()).data(), before)
})

test('--apply：寫回重算的值，其他欄位不動；再跑一次就一致', async () => {
  const ref = await seed('bad2', { totalAmount: 1, incomeCount: 9, memberExpenseCounts: { [A]: 7 } })
  const r = await run({ groupId: 'bad2', apply: true })
  assert.deepEqual([r.fixed, r.skipped, r.mismatched[0].outcome], [1, 0, 'fixed'])
  const data = (await ref.get()).data()
  assert.deepEqual([data.totalAmount, data.totalExpenses, data.totalIncome, data.incomeCount], [130, 2, 20, 1])
  // A：付 100、應分攤 65（50+15）→ +35；B 轉給 A 的 10 → A -10；收入 A 收款 20 → -20、分得 10 → +10；合計 15，B 相反
  assert.deepEqual(data.memberBalances, { [A]: 15, [B]: -15 })
  assert.deepEqual(data.memberExpenseCounts, { [A]: 2, [B]: 2 })
  assert.deepEqual([data.name, data.createdBy, data.members], ['G bad2', A, [A, B]])
  assert.equal((await run({ groupId: 'bad2' })).mismatched.length, 0)
})

test('寫入前群組被改過（有人剛記帳）：跳過那個群組，不蓋掉新資料', async () => {
  const ref = await seed('race1', { totalExpenses: 9 })
  // 重算發生在「讀到群組」之後、寫入之前：在這裡改動群組，模擬有人剛記帳
  let touched = false
  const computeAndTouch = async (...args) => {
    if (!touched) { touched = true; await ref.update({ note: 'concurrent' }) }
    return computeGroupAggregates(...args)
  }
  const r = await checkAggregates(db, { computeAggregates: computeAndTouch, apply: true, groupId: 'race1' })
  assert.deepEqual([r.fixed, r.skipped, r.mismatched[0].outcome], [0, 1, 'changed'])
  const data = (await ref.get()).data()
  assert.equal(data.note, 'concurrent')
  assert.equal(data.totalExpenses, 9) // 沒有被改，重跑一次就會修
  assert.equal((await run({ groupId: 'race1', apply: true })).fixed, 1)
})

test('不指定群組時掃描全部（含超過一頁的群組數），只列出有問題的', async () => {
  const before = await db.collection('groups').get()
  const batch = db.batch()
  for (let i = 0; i < 210; i++) batch.set(db.doc(`groups/many${String(i).padStart(3, '0')}`), { name: `m${i}`, members: [A], createdBy: A, totalAmount: 0, totalExpenses: 0, memberBalances: { [A]: 0 }, memberExpenseCounts: {} })
  await batch.commit()
  const r = await run({})
  assert.equal(r.scanned, before.size + 210)
  // 前面測試留下的：bad1（dry-run 沒修）有問題，其他一致
  assert.deepEqual(r.mismatched.map((m) => m.id), ['bad1'])
})
