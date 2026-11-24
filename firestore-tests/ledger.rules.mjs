// 個人帳本（users/{uid}/ledgers 與其 accounts、transactions、groupLinks）的 rules 測試；
// 需要 firestore emulator，用 npm run test:rules 執行
import { test, before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore'

let env
const dbAs = (uid, claims) => env.authenticatedContext(uid, claims).firestore()
const ledgerRef = (db, uid, id = 'l1') => doc(db, 'users', uid, 'ledgers', id)
const accountRef = (db, uid, id = 'a1', ledger = 'l1') => doc(db, 'users', uid, 'ledgers', ledger, 'accounts', id)
const txRef = (db, uid, id = 't1', ledger = 'l1') => doc(db, 'users', uid, 'ledgers', ledger, 'transactions', id)
const linkRef = (db, uid, id = 'g1', ledger = 'l1') => doc(db, 'users', uid, 'ledgers', ledger, 'groupLinks', id)

const now = () => Timestamp.now()
const ledger = (extra = {}) => ({ name: '日本行 2026', baseCurrency: 'JPY', createdAt: now(), ...extra })
const account = (extra = {}) => ({ name: '現金', type: 'cash', currency: 'JPY', initialBalance: 0, balance: 0, kind: 'normal', createdAt: now(), ...extra })
const expense = (extra = {}) => ({
  type: 'expense', accountId: 'a1', amount: 980, currency: 'JPY', exchangeRate: 1, baseAmount: 980,
  title: '拉麵', category: 'food', note: '', date: '2026-11-24', source: { type: 'manual' }, createdAt: now(), ...extra,
})
const transfer = (extra = {}) => ({
  type: 'transfer', accountId: 'a1', amount: 4200, currency: 'TWD', toAccountId: 'a2', toAmount: 20000,
  date: '2026-11-23', source: { type: 'manual' }, createdAt: now(), ...extra,
})

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-catsplit-ledger',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
})

after(async () => {
  await env?.cleanup()
})

// ---------- 權限 ----------

test('本人可建立、讀取、更新帳本、帳戶、帳目與群組連結', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(ledgerRef(db, 'u1'), ledger()))
  await assertSucceeds(getDoc(ledgerRef(db, 'u1')))
  await assertSucceeds(updateDoc(ledgerRef(db, 'u1'), { name: '新名稱' }))
  await assertSucceeds(setDoc(accountRef(db, 'u1'), account()))
  await assertSucceeds(getDoc(accountRef(db, 'u1')))
  await assertSucceeds(updateDoc(accountRef(db, 'u1'), { balance: 500 }))
  await assertSucceeds(setDoc(txRef(db, 'u1'), expense()))
  await assertSucceeds(getDoc(txRef(db, 'u1')))
  await assertSucceeds(updateDoc(txRef(db, 'u1'), { amount: 1000, baseAmount: 1000 }))
  await assertSucceeds(setDoc(linkRef(db, 'u1'), { linkedAt: now(), groupName: '日本行' }))
  await assertSucceeds(getDoc(linkRef(db, 'u1')))
})

test('本人可刪除帳戶、帳目與群組連結，但客戶端不能刪帳本文件', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(ledgerRef(db, 'u1'), ledger()))
  await assertSucceeds(setDoc(accountRef(db, 'u1'), account()))
  await assertSucceeds(setDoc(txRef(db, 'u1'), expense()))
  await assertSucceeds(setDoc(linkRef(db, 'u1'), { linkedAt: now(), groupName: '日本行' }))
  await assertSucceeds(deleteDoc(txRef(db, 'u1')))
  await assertSucceeds(deleteDoc(accountRef(db, 'u1')))
  await assertSucceeds(deleteDoc(linkRef(db, 'u1')))
  await assertFails(deleteDoc(ledgerRef(db, 'u1')))
})

test('別人與未登入不能讀寫我的帳本資料', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(ledgerRef(db, 'u1'), ledger())
    await setDoc(accountRef(db, 'u1'), account())
    await setDoc(txRef(db, 'u1'), expense())
    await setDoc(linkRef(db, 'u1'), { linkedAt: now(), groupName: '日本行' })
  })
  const other = dbAs('u2')
  await assertFails(getDoc(ledgerRef(other, 'u1')))
  await assertFails(getDoc(accountRef(other, 'u1')))
  await assertFails(getDoc(txRef(other, 'u1')))
  await assertFails(getDoc(linkRef(other, 'u1')))
  await assertFails(setDoc(ledgerRef(other, 'u1', 'l2'), ledger()))
  await assertFails(setDoc(accountRef(other, 'u1', 'a2'), account()))
  await assertFails(setDoc(txRef(other, 'u1', 't2'), expense()))
  await assertFails(updateDoc(txRef(other, 'u1'), { amount: 1, baseAmount: 1 }))
  await assertFails(deleteDoc(txRef(other, 'u1')))
  const anon = env.unauthenticatedContext().firestore()
  await assertFails(getDoc(ledgerRef(anon, 'u1')))
  await assertFails(getDoc(txRef(anon, 'u1')))
})

test('訪客 token 不能寫帳本、帳戶、帳目與群組連結', async () => {
  const db = dbAs('u1', { guest: true })
  await assertFails(setDoc(ledgerRef(db, 'u1'), ledger()))
  await assertFails(setDoc(accountRef(db, 'u1'), account()))
  await assertFails(setDoc(txRef(db, 'u1'), expense()))
  await assertFails(setDoc(linkRef(db, 'u1'), { linkedAt: now(), groupName: '日本行' }))
})

// ---------- 帳本 ----------

test('帳本驗證：名稱、統計幣別、未知欄位', async () => {
  const db = dbAs('u1')
  const w = (extra) => setDoc(ledgerRef(db, 'u1'), ledger(extra))
  await assertFails(w({ name: '' }))
  await assertFails(w({ name: 'a'.repeat(21) }))
  await assertFails(w({ name: 123 }))
  await assertFails(w({ baseCurrency: 'JP' }))
  await assertFails(w({ baseCurrency: 123 }))
  await assertFails(w({ createdAt: '2026-11-24' }))
  await assertFails(w({ archived: 'yes' }))
  await assertFails(w({ extra: 1 }))
  await assertSucceeds(w({ icon: 'plane', color: 'blue', archived: false }))
})

test('帳本統計幣別與建立時間建立後不可改', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(ledgerRef(db, 'u1'), ledger()))
  await assertFails(updateDoc(ledgerRef(db, 'u1'), { baseCurrency: 'TWD' }))
  await assertFails(updateDoc(ledgerRef(db, 'u1'), { createdAt: Timestamp.fromMillis(1) }))
  await assertSucceeds(updateDoc(ledgerRef(db, 'u1'), { archived: true }))
})

// ---------- 帳戶 ----------

test('帳戶驗證：名稱、種類、幣別、餘額、快照帳戶', async () => {
  const db = dbAs('u1')
  const w = (extra) => setDoc(accountRef(db, 'u1'), account(extra))
  await assertFails(w({ name: '' }))
  await assertFails(w({ name: 'a'.repeat(21) }))
  await assertFails(w({ type: 'crypto' }))
  await assertFails(w({ currency: 'JPYY' }))
  await assertFails(w({ initialBalance: '0' }))
  await assertFails(w({ balance: 1e12 }))
  await assertFails(w({ balance: -1e12 }))
  await assertFails(w({ kind: 'special' }))
  await assertFails(w({ extra: 1 }))
  await assertSucceeds(w({ balance: -8650, initialBalance: -7590, type: 'credit' }))
  // 群組快照帳戶：kind 與 type 必須同為 group
  await assertSucceeds(setDoc(accountRef(db, 'u1', 'snap_g1'), account({ type: 'group', kind: 'group', syncedCount: 2, syncedNet: -2300 })))
  await assertFails(setDoc(accountRef(db, 'u1', 'snap_g2'), account({ type: 'cash', kind: 'group' })))
  await assertFails(setDoc(accountRef(db, 'u1', 'snap_g3'), account({ type: 'group', kind: 'normal' })))
  await assertFails(setDoc(accountRef(db, 'u1', 'snap_g4'), account({ type: 'group', kind: 'group', syncedCount: -1 })))
  await assertFails(setDoc(accountRef(db, 'u1', 'snap_g5'), account({ type: 'group', kind: 'group', syncedCount: 1.5 })))
})

test('帳戶幣別與種類建立後不可改', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(accountRef(db, 'u1'), account()))
  await assertFails(updateDoc(accountRef(db, 'u1'), { currency: 'TWD' }))
  await assertFails(updateDoc(accountRef(db, 'u1'), { kind: 'group', type: 'group' }))
  await assertSucceeds(updateDoc(accountRef(db, 'u1'), { name: '日圓現金', balance: 12345, archived: true }))
})

// ---------- 帳目 ----------

test('收入與支出驗證：種類、金額、幣別、日期、匯率與統計金額', async () => {
  const db = dbAs('u1')
  const w = (extra) => setDoc(txRef(db, 'u1'), expense(extra))
  await assertFails(w({ type: 'refund' }))
  await assertFails(w({ amount: 0 }))
  await assertFails(w({ amount: -1 }))
  await assertFails(w({ amount: '100' }))
  await assertFails(w({ amount: 1e12 }))
  await assertFails(w({ currency: 'jp' }))
  await assertFails(w({ date: '2026/11/24' }))
  await assertFails(w({ date: '2026-1-24' }))
  await assertFails(w({ date: 20261124 }))
  await assertFails(w({ exchangeRate: 0 }))
  await assertFails(w({ baseAmount: 0 }))
  await assertFails(w({ baseAmount: '980' }))
  await assertFails(w({ title: 'a'.repeat(51) }))
  await assertFails(w({ category: 'a'.repeat(31) }))
  await assertFails(w({ note: 'a'.repeat(51) }))
  await assertFails(w({ createdAt: '2026-11-24' }))
  await assertFails(w({ unknown: 1 }))
  await assertSucceeds(w({ type: 'income', category: 'salary' }))
})

test('收入與支出必須帶匯率與統計金額；不能帶轉帳欄位', async () => {
  const db = dbAs('u1')
  const noRate = expense(); delete noRate.exchangeRate
  const noBase = expense(); delete noBase.baseAmount
  await assertFails(setDoc(txRef(db, 'u1'), noRate))
  await assertFails(setDoc(txRef(db, 'u1'), noBase))
  await assertFails(setDoc(txRef(db, 'u1'), expense({ toAccountId: 'a2' })))
  await assertFails(setDoc(txRef(db, 'u1'), expense({ toAmount: 100 })))
})

test('跨幣別帳目可帶扣款金額與扣款匯率，且須為正數', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(txRef(db, 'u1'), expense({ currency: 'JPY', accountId: 'a-twd', amount: 14500, baseAmount: 14500, accountAmount: 3050, accountRate: 0.21 })))
  await assertFails(setDoc(txRef(db, 'u1', 't2'), expense({ accountAmount: 0 })))
  await assertFails(setDoc(txRef(db, 'u1', 't3'), expense({ accountAmount: '3050' })))
  await assertFails(setDoc(txRef(db, 'u1', 't4'), expense({ accountRate: -1 })))
})

test('轉帳驗證：轉入帳戶與轉入金額、不能自己轉給自己、不帶匯率與統計金額', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(txRef(db, 'u1'), transfer()))
  const noTo = transfer(); delete noTo.toAccountId
  const noToAmount = transfer(); delete noToAmount.toAmount
  await assertFails(setDoc(txRef(db, 'u1', 't2'), noTo))
  await assertFails(setDoc(txRef(db, 'u1', 't3'), noToAmount))
  await assertFails(setDoc(txRef(db, 'u1', 't4'), transfer({ toAccountId: 'a1' })))
  await assertFails(setDoc(txRef(db, 'u1', 't5'), transfer({ toAmount: 0 })))
  await assertFails(setDoc(txRef(db, 'u1', 't6'), transfer({ baseAmount: 100 })))
  await assertFails(setDoc(txRef(db, 'u1', 't7'), transfer({ exchangeRate: 1 })))
  await assertFails(setDoc(txRef(db, 'u1', 't8'), transfer({ accountAmount: 100 })))
})

test('帳目來源驗證：種類、群組帳目要有群組與項目 id', async () => {
  const db = dbAs('u1')
  const w = (source, id = 't1') => setDoc(txRef(db, 'u1', id), expense({ source }))
  await assertSucceeds(w({ type: 'manual' }))
  await assertSucceeds(w({ type: 'fx' }, 't2'))
  await assertSucceeds(w({ type: 'group', groupId: 'g1', kind: 'expense', itemId: 'e1' }, 't3'))
  await assertSucceeds(w({ type: 'group', groupId: 'g1', kind: 'income', itemId: 'i1', detached: true, edited: { category: true } }, 't4'))
  await assertFails(w({ type: 'bank' }, 't5'))
  await assertFails(w({ type: 'group', groupId: 'g1' }, 't6'))
  await assertFails(w({ type: 'group', groupId: 'g1', kind: 'transfer', itemId: 'e1' }, 't7'))
  await assertFails(w({ type: 'manual', extra: 1 }, 't8'))
  await assertFails(w({ type: 'group', groupId: 'g1', kind: 'expense', itemId: 'e1', detached: 'yes' }, 't9'))
  await assertFails(w('manual', 't10'))
  await assertFails(setDoc(txRef(db, 'u1', 't11'), (() => { const t = expense(); delete t.source; return t })()))
})

test('帳目建立時間建立後不可改', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(txRef(db, 'u1'), expense()))
  await assertFails(updateDoc(txRef(db, 'u1'), { createdAt: Timestamp.fromMillis(1) }))
})

test('同一個 uid 底下的不同帳本互不影響，帳目路徑必須在自己的帳本下', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(txRef(db, 'u1', 't1', 'l1'), expense()))
  await assertSucceeds(setDoc(txRef(db, 'u1', 't1', 'l2'), expense({ amount: 1, baseAmount: 1 })))
  await assertFails(setDoc(txRef(dbAs('u2'), 'u1', 't1', 'l3'), expense()))
})

// ---------- 群組連結 ----------

test('群組連結驗證：欄位與群組名稱', async () => {
  const db = dbAs('u1')
  const w = (data, id = 'g1') => setDoc(linkRef(db, 'u1', id), data)
  await assertSucceeds(w({ linkedAt: now(), groupName: '日本行' }))
  await assertFails(w({ linkedAt: now() }, 'g2'))
  await assertFails(w({ groupName: '日本行' }, 'g3'))
  await assertFails(w({ linkedAt: '2026-11-24', groupName: '日本行' }, 'g4'))
  await assertFails(w({ linkedAt: now(), groupName: '' }, 'g5'))
  await assertFails(w({ linkedAt: now(), groupName: 'a'.repeat(51) }, 'g6'))
  await assertFails(w({ linkedAt: now(), groupName: '日本行', extra: 1 }, 'g7'))
  // 重新連結可以改 linkedAt
  await assertSucceeds(updateDoc(linkRef(db, 'u1'), { linkedAt: now() }))
})
