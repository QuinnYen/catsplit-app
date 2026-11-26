// 旅程永久刪除（src/features/fx/trashPurge.js）的整合測試：用 firestore 模擬器加真正的 rules，
// 驗證連同帳目刪除、帳戶餘額退回、分批、並發不重複退款、中途還原、帳戶不存在。需要 firestore emulator，用 npm run test:rules 執行
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteField, Timestamp, collection, getDocs, query, where } from 'firebase/firestore'
import { purgeTrip, PURGE_CHUNK } from '../src/features/fx/trashPurge.js'

let env
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-catsplit-purge', firestore: { rules: readFileSync('firestore.rules', 'utf8') } })
})
beforeEach(async () => { await env.clearFirestore() })
after(async () => { await env?.cleanup() })

const UID = 'u1'
const L = 'l1'
const ref = (db, ...p) => doc(db, 'users', UID, 'ledgers', L, ...p)
const ownerDb = () => env.authenticatedContext(UID).firestore()
const now = () => Timestamp.now()

const account = (balance, extra = {}) => ({ name: '帳戶', type: 'cash', currency: 'TWD', initialBalance: 0, balance, kind: 'normal', createdAt: now(), ...extra })
const expense = (amount, extra = {}) => ({
  type: 'expense', accountId: 'cash', amount, currency: 'TWD', exchangeRate: 1, baseAmount: amount, category: 'food', date: '2026-11-08', source: { type: 'manual' }, createdAt: now(), ...extra,
})
const income = (amount, extra = {}) => expense(amount, { type: 'income', ...extra })
const transfer = (amount, toAmount, extra = {}) => ({
  type: 'transfer', accountId: 'cash', toAccountId: 'card', amount, currency: 'TWD', toAmount, date: '2026-11-08', source: { type: 'manual' }, createdAt: now(), ...extra,
})

// 種資料（略過 rules）：帳本、兩個帳戶（餘額 = 期初 − 旅程帳目的影響）、一趟垃圾桶中的旅程與它的帳目、一筆不屬於旅程的帳目
const seed = async ({ txs, cash = 0, card = 0, trashed = true, cashExists = true }) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', UID, 'ledgers', L), { name: '帳本', baseCurrency: 'TWD', createdAt: now() })
    if (cashExists) await setDoc(ref(db, 'accounts', 'cash'), account(cash))
    await setDoc(ref(db, 'accounts', 'card'), account(card, { name: '卡' }))
    await setDoc(ref(db, 'trips', 'tp1'), { name: '大分', currency: 'JPY', createdAt: now(), ...(trashed && { deletedAt: now() }) })
    await setDoc(ref(db, 'transactions', 'keep'), expense(77)) // 一般帳目，不能被動到
    await Promise.all(txs.map((tx, i) => setDoc(ref(db, 'transactions', `t${i}`), { ...tx, tripId: 'tp1' })))
  })
}
// withSecurityRulesDisabled 不回傳值，結果要從閉包帶出來
const read = async (path) => {
  let out = null
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(ref(ctx.firestore(), ...path))
    out = snap.exists() ? snap.data() : null
  })
  return out
}
const balances = async () => ({ cash: (await read(['accounts', 'cash']))?.balance, card: (await read(['accounts', 'card']))?.balance })
const tripTxCount = async () => {
  let n = -1
  await env.withSecurityRulesDisabled(async (ctx) => {
    n = (await getDocs(query(collection(ctx.firestore(), 'users', UID, 'ledgers', L, 'transactions'), where('tripId', '==', 'tp1')))).size
  })
  return n
}

test('連同帳目刪除，並退回帳戶餘額（支出、收入、轉帳），一般帳目與旅程以外的資料不受影響', async () => {
  // 現金期初 5000：支出 1000、收入 200、轉出 500 → 3700；卡轉入 480 → 480
  await seed({ txs: [expense(1000), income(200), transfer(500, 480)], cash: 3700, card: 480 })
  const r = await purgeTrip(ownerDb(), UID, L, 'tp1')
  assert.deepEqual(r, { deleted: 3, finished: true })
  assert.deepEqual(await balances(), { cash: 5000, card: 0 })
  assert.equal(await tripTxCount(), 0)
  assert.equal(await read(['trips', 'tp1']), null) // 旅程文件最後才刪
  assert.equal((await read(['transactions', 'keep'])).amount, 77)
})

test('跨幣別帳目用扣款金額退回', async () => {
  await seed({ txs: [expense(11811, { currency: 'JPY', accountAmount: 2362, exchangeRate: 0.2, baseAmount: 2362 })], cash: 100 - 2362 })
  await purgeTrip(ownerDb(), UID, L, 'tp1')
  assert.equal((await balances()).cash, 100)
})

test('沒有帳目的旅程：直接刪旅程文件', async () => {
  await seed({ txs: [] })
  assert.deepEqual(await purgeTrip(ownerDb(), UID, L, 'tp1'), { deleted: 0, finished: true })
  assert.equal(await read(['trips', 'tp1']), null)
})

test('帳目超過一批：分批處理，餘額只退一次、不多不少', async () => {
  const n = PURGE_CHUNK * 2 + 50
  await seed({ txs: Array.from({ length: n }, (_, i) => expense(10 + (i % 7))), cash: -Array.from({ length: n }, (_, i) => 10 + (i % 7)).reduce((a, b) => a + b, 0) })
  const r = await purgeTrip(ownerDb(), UID, L, 'tp1')
  assert.deepEqual(r, { deleted: n, finished: true })
  assert.equal((await balances()).cash, 0)
  assert.equal(await tripTxCount(), 0)
})

test('不在垃圾桶（已還原）的旅程：什麼都不刪、不退款', async () => {
  await seed({ txs: [expense(1000)], cash: -1000, trashed: false })
  const r = await purgeTrip(ownerDb(), UID, L, 'tp1')
  assert.deepEqual(r, { deleted: 0, finished: false, reason: 'restored' })
  assert.equal(await tripTxCount(), 1)
  assert.equal((await balances()).cash, -1000)
  assert.ok(await read(['trips', 'tp1']))
})

test('旅程不存在：回報 missing，不丟錯，可以重複執行', async () => {
  await seed({ txs: [] })
  await purgeTrip(ownerDb(), UID, L, 'tp1')
  assert.deepEqual(await purgeTrip(ownerDb(), UID, L, 'tp1'), { deleted: 0, finished: false, reason: 'missing' })
})

test('預算用完先停（自動清除每次有上限），旅程仍在垃圾桶，之後接著處理；中途被還原就停手', async () => {
  const amounts = Array.from({ length: 150 }, () => 10)
  await seed({ txs: amounts.map((a) => expense(a)), cash: -1500 })
  const db = ownerDb()
  const first = await purgeTrip(db, UID, L, 'tp1', { maxTxs: 100 })
  assert.deepEqual(first, { deleted: 100, finished: false, reason: 'budget' })
  assert.equal(await tripTxCount(), 50)
  assert.equal((await balances()).cash, -500) // 只退了刪掉的那 100 筆
  assert.ok(await read(['trips', 'tp1'])) // 旅程文件還在

  // 這時使用者在別處把旅程還原了：不能再刪任何東西
  await updateDoc(ref(db, 'trips', 'tp1'), { deletedAt: deleteField() })
  assert.deepEqual(await purgeTrip(db, UID, L, 'tp1'), { deleted: 0, finished: false, reason: 'restored' })
  assert.equal(await tripTxCount(), 50)
  assert.equal((await balances()).cash, -500)

  // 又刪進垃圾桶：接著處理，總共退款恰好一次
  await updateDoc(ref(db, 'trips', 'tp1'), { deletedAt: now() })
  assert.deepEqual(await purgeTrip(db, UID, L, 'tp1'), { deleted: 50, finished: true })
  assert.equal((await balances()).cash, 0)
})

test('並發執行（兩個分頁、或自動與手動同時）：同一筆帳目只退一次', async () => {
  const n = PURGE_CHUNK + 60
  await seed({ txs: Array.from({ length: n }, () => expense(10)), cash: -n * 10 })
  const db = ownerDb()
  const results = await Promise.all([purgeTrip(db, UID, L, 'tp1'), purgeTrip(db, UID, L, 'tp1')])
  assert.equal(results.reduce((sum, r) => sum + r.deleted, 0), n, JSON.stringify(results)) // 兩邊合計剛好刪 n 筆
  assert.ok(results.some((r) => r.finished), JSON.stringify(results))
  assert.equal((await balances()).cash, 0) // 沒有重複退款
  assert.equal(await tripTxCount(), 0)
  assert.equal(await read(['trips', 'tp1']), null)
})

test('帳目指向的帳戶已不存在：照常刪除，其他帳戶照常退款', async () => {
  await seed({ txs: [expense(1000), transfer(500, 480)], card: 480, cashExists: false })
  const r = await purgeTrip(ownerDb(), UID, L, 'tp1')
  assert.deepEqual(r, { deleted: 2, finished: true })
  assert.equal((await balances()).card, 0) // 轉入的 480 退掉
  assert.equal(await tripTxCount(), 0)
})

test('別人不能永久刪除我的旅程', async () => {
  await seed({ txs: [expense(1000)], cash: -1000 })
  await assert.rejects(() => purgeTrip(env.authenticatedContext('u2').firestore(), UID, L, 'tp1'), /PERMISSION_DENIED|permission/i)
  assert.equal(await tripTxCount(), 1)
  assert.equal((await balances()).cash, -1000)
})
