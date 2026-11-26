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
const tripRef = (db, uid, id = 'tp1', ledger = 'l1') => doc(db, 'users', uid, 'ledgers', ledger, 'trips', id)

const now = () => Timestamp.now()
const ledger = (extra = {}) => ({ name: '日本行 2026', baseCurrency: 'JPY', createdAt: now(), ...extra })
const account = (extra = {}) => ({ name: '現金', type: 'cash', currency: 'JPY', initialBalance: 0, balance: 0, kind: 'normal', createdAt: now(), ...extra })
const expense = (extra = {}) => ({
  type: 'expense', accountId: 'a1', amount: 980, currency: 'JPY', exchangeRate: 1, baseAmount: 980,
  title: '拉麵', category: 'food', note: '', date: '2026-11-24', source: { type: 'manual' }, createdAt: now(), ...extra,
})
const trip = (extra = {}) => ({ name: '2026 大分溫泉', currency: 'JPY', createdAt: now(), ...extra })
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

test('帳本期間設定：月開始日 0–28（0 是月末）、週開始日 0／1／6，必須是整數', async () => {
  const db = dbAs('u1')
  const w = (extra) => setDoc(ledgerRef(db, 'u1'), ledger(extra))
  const ok = (id, extra) => setDoc(ledgerRef(db, 'u1', id), ledger(extra))
  await assertSucceeds(ok('l1', { monthStartDay: 5, weekStartDay: 1 }))
  await assertSucceeds(ok('l2', { monthStartDay: 0, weekStartDay: 6 }))
  await assertSucceeds(ok('l3', { monthStartDay: 28, weekStartDay: 0 }))
  await assertFails(w({ monthStartDay: 29 }))
  await assertFails(w({ monthStartDay: -1 }))
  await assertFails(w({ monthStartDay: 5.5 }))
  await assertFails(w({ monthStartDay: '5' }))
  await assertFails(w({ weekStartDay: 2 }))
  await assertFails(w({ weekStartDay: '1' }))
  await assertSucceeds(updateDoc(ledgerRef(db, 'u1', 'l1'), { monthStartDay: 10 }))
  await assertFails(updateDoc(ledgerRef(db, 'u1', 'l1'), { weekStartDay: 7 }))
})

test('帳本年開始月與預算：年開始月 1–12 整數，預算必須是正數', async () => {
  const db = dbAs('u1')
  const ok = (id, extra) => setDoc(ledgerRef(db, 'u1', id), ledger(extra))
  await assertSucceeds(ok('l1', { yearStartMonth: 4, monthBudget: 30000, yearBudget: 360000 }))
  await assertSucceeds(ok('l2', { yearStartMonth: 12, monthBudget: 100.5 }))
  await assertFails(ok('l3', { yearStartMonth: 0 }))
  await assertFails(ok('l3', { yearStartMonth: 13 }))
  await assertFails(ok('l3', { yearStartMonth: 1.5 }))
  await assertFails(ok('l3', { monthBudget: 0 }))
  await assertFails(ok('l3', { monthBudget: -5 }))
  await assertFails(ok('l3', { yearBudget: '1000' }))
  await assertFails(ok('l3', { yearBudget: 1e12 }))
  await assertSucceeds(updateDoc(ledgerRef(db, 'u1', 'l1'), { monthBudget: 20000 }))
  await assertFails(updateDoc(ledgerRef(db, 'u1', 'l1'), { monthBudget: 0 }))
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

test('帳戶管理：期初餘額與餘額可一起調整、封存與取消封存、可刪除', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(accountRef(db, 'u1'), account({ initialBalance: 1000, balance: 1000 })))
  await assertSucceeds(updateDoc(accountRef(db, 'u1'), { initialBalance: 1500, balance: 1500, name: '日圓現金', type: 'bank' }))
  await assertSucceeds(updateDoc(accountRef(db, 'u1'), { archived: true }))
  await assertSucceeds(updateDoc(accountRef(db, 'u1'), { archived: false }))
  await assertFails(updateDoc(accountRef(db, 'u1'), { archived: 'yes' }))
  await assertFails(updateDoc(accountRef(db, 'u1'), { type: 'crypto' }))
  await assertSucceeds(deleteDoc(accountRef(db, 'u1')))
})

// ---------- 類別 ----------

const categoryRef = (db, uid, id) => doc(db, 'users', uid, 'ledgers', 'l1', 'categories', id)

test('類別：欄位、種類、文件 id 與 key 對應、自訂類別必須有名稱、順序是整數', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(ledgerRef(db, 'u1'), ledger()))
  const w = (id, data) => setDoc(categoryRef(db, 'u1', id), data)
  await assertSucceeds(w('e_food', { kind: 'expense', key: 'food', order: 0 }))
  await assertSucceeds(w('i_other', { kind: 'income', key: 'other', order: 4, name: '雜項收入' }))
  await assertSucceeds(w('e_other', { kind: 'expense', key: 'other', order: 7 })) // 支出與收入的 other 不撞
  await assertSucceeds(w('e_c_abc', { kind: 'expense', key: 'c_abc', name: '咖啡', order: 8 }))
  await assertFails(w('e_c_noname', { kind: 'expense', key: 'c_noname', order: 9 })) // 自訂類別要有名稱
  await assertFails(w('e_wrong', { kind: 'expense', key: 'food', order: 0 })) // 文件 id 要對得上種類與 key
  await assertFails(w('i_food', { kind: 'expense', key: 'food', order: 0 }))
  await assertFails(w('e_x', { kind: 'other', key: 'x', order: 0 }))
  await assertFails(w('e_food', { kind: 'expense', key: 'food', order: 1.5 }))
  await assertFails(w('e_food', { kind: 'expense', key: 'food', order: -1 }))
  await assertFails(w('e_food', { kind: 'expense', key: 'food', order: 0, name: '' }))
  await assertFails(w('e_food', { kind: 'expense', key: 'food', order: 0, name: 'a'.repeat(21) }))
  await assertFails(w('e_food', { kind: 'expense', key: 'food', order: 0, extra: 1 }))
  await assertFails(w('e_k', { kind: 'expense', key: 'k'.repeat(31), order: 0 }))
  await assertSucceeds(w('e_daily', { kind: 'expense', key: 'daily', order: 5, budget: 3000 })) // 分類預算
  await assertFails(w('e_medical', { kind: 'expense', key: 'medical', order: 6, budget: 0 }))
  await assertFails(w('e_lodging', { kind: 'expense', key: 'lodging', order: 7, budget: '100' }))
  await assertFails(w('i_salary', { kind: 'income', key: 'salary', order: 0, budget: 100 })) // 收入類別沒有預算
  await assertSucceeds(updateDoc(categoryRef(db, 'u1', 'e_food'), { name: '美食', order: 3 }))
  await assertSucceeds(deleteDoc(categoryRef(db, 'u1', 'e_food')))
})

test('類別：別人與未登入不能讀寫，訪客不能寫', async () => {
  await assertSucceeds(setDoc(categoryRef(dbAs('u1'), 'u1', 'e_food'), { kind: 'expense', key: 'food', order: 0 }))
  await assertFails(getDoc(categoryRef(dbAs('u2'), 'u1', 'e_food')))
  await assertFails(setDoc(categoryRef(dbAs('u2'), 'u1', 'e_daily'), { kind: 'expense', key: 'daily', order: 1 }))
  await assertFails(getDoc(categoryRef(env.unauthenticatedContext().firestore(), 'u1', 'e_food')))
  await assertFails(setDoc(categoryRef(dbAs('u1', { guest: true }), 'u1', 'e_daily'), { kind: 'expense', key: 'daily', order: 1 }))
})

// ---------- 固定收支 ----------

const ruleRef = (db, uid, id = 'r1') => doc(db, 'users', uid, 'ledgers', 'l1', 'recurring', id)
const rule = (extra = {}) => ({ kind: 'expense', name: '房租', accountId: 'cash', amount: 8000, frequency: 'monthly', startDate: '2026-11-05', dayOfMonth: 5, enabled: true, createdAt: now(), ...extra })

test('固定收支規則：欄位、種類、頻率、日期格式、金額、轉帳條件', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(ledgerRef(db, 'u1'), ledger()))
  const w = (id, extra) => setDoc(ruleRef(db, 'u1', id), rule(extra))
  await assertSucceeds(w('a', { category: 'daily', note: '每月房租', endDate: '2027-11-05', rate: 0.21, generatedThrough: '2026-11-05' }))
  await assertSucceeds(w('b', { kind: 'income', frequency: 'weekly', dayOfMonth: 0 }))
  await assertSucceeds(w('c', { kind: 'transfer', toAccountId: 'bank' }))
  await assertFails(w('d', { name: '' }))
  await assertFails(w('d', { name: 'x'.repeat(21) }))
  await assertFails(w('d', { kind: 'refund' }))
  await assertFails(w('d', { frequency: 'hourly' }))
  await assertFails(w('d', { startDate: '2026/11/05' }))
  await assertFails(w('d', { endDate: '2027-1-1' }))
  await assertFails(w('d', { amount: 0 }))
  await assertFails(w('d', { dayOfMonth: 29 }))
  await assertFails(w('d', { enabled: 'yes' }))
  await assertFails(w('d', { extra: 1 }))
  await assertFails(w('d', { kind: 'transfer' })) // 轉帳要有轉入帳戶
  await assertFails(w('d', { kind: 'transfer', toAccountId: 'cash' })) // 不能轉給自己
  await assertFails(w('d', { kind: 'transfer', toAccountId: 'bank', category: 'food' })) // 轉帳沒有類別
  await assertFails(w('d', { toAccountId: 'bank' })) // 收支不能有轉入帳戶
  await assertSucceeds(updateDoc(ruleRef(db, 'u1', 'a'), { enabled: false, generatedThrough: '2026-12-05', amount: 9000 }))
  await assertFails(updateDoc(ruleRef(db, 'u1', 'a'), { createdAt: Timestamp.fromMillis(1) }))
  await assertSucceeds(deleteDoc(ruleRef(db, 'u1', 'a')))
})

test('固定收支規則：別人與訪客不能讀寫', async () => {
  await assertSucceeds(setDoc(ruleRef(dbAs('u1'), 'u1', 'a'), rule()))
  await assertFails(getDoc(ruleRef(dbAs('u2'), 'u1', 'a')))
  await assertFails(setDoc(ruleRef(dbAs('u2'), 'u1', 'b'), rule()))
  await assertFails(setDoc(ruleRef(dbAs('u1', { guest: true }), 'u1', 'c'), rule()))
})

test('固定收支產生的帳目：來源 recurring 要帶規則 id 與原定日期；帳本假日調整只接受三個值', async () => {
  const db = dbAs('u1')
  const recurring = (extra) => expense({ source: { type: 'recurring', ruleId: 'r1', scheduled: '2026-11-05' }, ...extra })
  await assertSucceeds(setDoc(txRef(db, 'u1', 'r_r1_2026-11-05'), recurring()))
  await assertFails(setDoc(txRef(db, 'u1', 'x1'), expense({ source: { type: 'recurring' } })))
  await assertFails(setDoc(txRef(db, 'u1', 'x2'), expense({ source: { type: 'recurring', ruleId: 'r1', scheduled: '11/05' } })))
  const ok = (id, extra) => setDoc(ledgerRef(db, 'u1', id), ledger(extra))
  await assertSucceeds(ok('h1', { holidayAdjust: 'before' }))
  await assertSucceeds(ok('h2', { holidayAdjust: 'after' }))
  await assertSucceeds(ok('h3', { holidayAdjust: 'none' }))
  await assertFails(ok('h4', { holidayAdjust: 'skip' }))
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

// ---------- 旅程（匯率頁）----------

test('旅程：本人可建立、讀取、更新、刪除；別人、未登入、訪客不行', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(ledgerRef(db, 'u1'), ledger()))
  await assertSucceeds(setDoc(tripRef(db, 'u1'), trip()))
  await assertSucceeds(getDoc(tripRef(db, 'u1')))
  await assertSucceeds(updateDoc(tripRef(db, 'u1'), { name: '大分', countInStats: true }))
  const other = dbAs('u2')
  await assertFails(getDoc(tripRef(other, 'u1')))
  await assertFails(setDoc(tripRef(other, 'u1', 'tp2'), trip()))
  await assertFails(updateDoc(tripRef(other, 'u1'), { name: 'x' }))
  await assertFails(deleteDoc(tripRef(other, 'u1')))
  await assertFails(getDoc(tripRef(env.unauthenticatedContext().firestore(), 'u1')))
  await assertFails(setDoc(tripRef(dbAs('u1', { guest: true }), 'u1', 'tp3'), trip()))
  await assertSucceeds(deleteDoc(tripRef(db, 'u1')))
})

test('旅程驗證：名稱、旅遊幣別、日期、開關、垃圾桶時間、換算列、實付幣別、未知欄位', async () => {
  const db = dbAs('u1')
  const w = (data, id) => setDoc(tripRef(db, 'u1', id), data)
  await assertSucceeds(w(trip({ startDate: '2026-11-07', endDate: '2026-11-10', countInStats: false, archived: true, rows: ['JPY', 'TWD', 'CNY'], payCurrency: 'JPY' }), 'ok1'))
  await assertSucceeds(w(trip({ deletedAt: now() }), 'ok2'))
  await assertFails(w(trip({ name: '' }), 'n1'))
  await assertFails(w(trip({ name: 'a'.repeat(21) }), 'n2'))
  await assertFails(w({ name: '旅程', createdAt: now() }, 'n3')) // 缺旅遊幣別
  await assertFails(w(trip({ currency: 'JP' }), 'c1'))
  await assertFails(w(trip({ payCurrency: 'JPYY' }), 'c2'))
  await assertFails(w(trip({ startDate: '2026/11/07' }), 'd1'))
  await assertFails(w(trip({ endDate: 20261110 }), 'd2'))
  await assertFails(w(trip({ countInStats: 'yes' }), 'b1'))
  await assertFails(w(trip({ archived: 1 }), 'b2'))
  await assertFails(w(trip({ deletedAt: '2026-11-26' }), 't1'))
  await assertFails(w(trip({ rows: 'JPY' }), 'r1'))
  await assertFails(w(trip({ rows: ['JPY', 'TWD', 'CNY', 'USD', 'EUR', 'KRW', 'HKD'] }), 'r2')) // 最多 6 個
  await assertFails(w(trip({ extra: 1 }), 'x1'))
  await assertFails(w(trip({ createdAt: '2026-11-26' }), 'x2'))
})

test('旅程建立時間建立後不可改，其他欄位可改', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(tripRef(db, 'u1'), trip()))
  await assertFails(updateDoc(tripRef(db, 'u1'), { createdAt: Timestamp.fromMillis(1) }))
  await assertSucceeds(updateDoc(tripRef(db, 'u1'), { deletedAt: now(), countInStats: true }))
})

test('帳目的 tripId：選填，字串 1–100 字；支出、收入、轉帳都可帶', async () => {
  const db = dbAs('u1')
  const w = (data, id) => setDoc(txRef(db, 'u1', id), data)
  await assertSucceeds(w(expense({ tripId: 'tp1', source: { type: 'fx' } }), 'e1'))
  await assertSucceeds(w(expense({ type: 'income', tripId: 'tp1' }), 'e2'))
  await assertSucceeds(w(transfer({ tripId: 'tp1' }), 'e3'))
  await assertSucceeds(w(expense(), 'e4')) // 沒有 tripId 照舊
  await assertFails(w(expense({ tripId: '' }), 'bad1'))
  await assertFails(w(expense({ tripId: 'x'.repeat(101) }), 'bad2'))
  await assertFails(w(expense({ tripId: 5 }), 'bad3'))
  await assertSucceeds(updateDoc(txRef(db, 'u1', 'e4'), { tripId: 'tp1' })) // 之後歸到旅程
})
