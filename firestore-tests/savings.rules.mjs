// 儲蓄目標（users/{uid}/savingsGoals 與其 entries）的 rules 測試；需要 firestore emulator，用 npm run test:rules 執行
import { test, before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore'

let env
const dbAs = (uid, claims) => env.authenticatedContext(uid, claims).firestore()
const goalRef = (db, uid, id = 'g1') => doc(db, 'users', uid, 'savingsGoals', id)
const entryRef = (db, uid, id = 'e1') => doc(db, 'users', uid, 'savingsGoals', 'g1', 'entries', id)

const goal = (extra = {}) => ({ title: '旅遊基金', targetAmount: 10000, currency: 'TWD', targetDate: null, ...extra })
const entry = (extra = {}) => ({ type: 'save', amount: 500, title: '發薪日', date: '2026-11-02', ...extra })

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-catsplit-savings',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
})

after(async () => {
  await env?.cleanup()
})

test('本人可建立、讀取、更新、刪除目標', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(goalRef(db, 'u1'), goal()))
  await assertSucceeds(getDoc(goalRef(db, 'u1')))
  await assertSucceeds(updateDoc(goalRef(db, 'u1'), { title: '新標題' }))
  await assertSucceeds(deleteDoc(goalRef(db, 'u1')))
})

test('本人可建立、讀取、更新、刪除紀錄', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(entryRef(db, 'u1'), entry()))
  await assertSucceeds(getDoc(entryRef(db, 'u1')))
  await assertSucceeds(updateDoc(entryRef(db, 'u1'), { amount: 600 }))
  await assertSucceeds(deleteDoc(entryRef(db, 'u1')))
})

test('別人與未登入不能讀寫我的目標與紀錄', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(goalRef(ctx.firestore(), 'u1'), goal())
    await setDoc(entryRef(ctx.firestore(), 'u1'), entry())
  })
  const other = dbAs('u2')
  await assertFails(getDoc(goalRef(other, 'u1')))
  await assertFails(setDoc(goalRef(other, 'u1', 'g2'), goal()))
  await assertFails(getDoc(entryRef(other, 'u1')))
  await assertFails(setDoc(entryRef(other, 'u1', 'e2'), entry()))
  const anon = env.unauthenticatedContext().firestore()
  await assertFails(getDoc(goalRef(anon, 'u1')))
  await assertFails(getDoc(entryRef(anon, 'u1')))
})

test('訪客 token 不能寫目標與紀錄', async () => {
  const db = dbAs('u1', { guest: true })
  await assertFails(setDoc(goalRef(db, 'u1'), goal()))
  await assertFails(setDoc(entryRef(db, 'u1'), entry()))
})

test('目標驗證：標題、金額、貨幣、目標日期', async () => {
  const db = dbAs('u1')
  const w = (extra) => setDoc(goalRef(db, 'u1'), goal(extra))
  await assertFails(w({ title: '' }))
  await assertFails(w({ title: 'a'.repeat(51) }))
  await assertFails(w({ targetAmount: 0 }))
  await assertFails(w({ targetAmount: -1 }))
  await assertFails(w({ targetAmount: '100' }))
  await assertFails(w({ targetAmount: 1e12 }))
  await assertFails(w({ currency: 123 }))
  await assertSucceeds(w({ targetDate: null }))
  await assertSucceeds(w({ targetDate: '2026-12-31' }))
})

test('紀錄驗證：類型、金額、標題、日期', async () => {
  const db = dbAs('u1')
  const w = (extra) => setDoc(entryRef(db, 'u1'), entry(extra))
  await assertFails(w({ type: 'other' }))
  await assertFails(w({ amount: 0 }))
  await assertFails(w({ amount: -5 }))
  await assertFails(w({ amount: '5' }))
  await assertFails(w({ amount: 1e12 }))
  await assertFails(w({ title: 'a'.repeat(101) }))
  await assertFails(w({ date: 20261102 }))
  await assertSucceeds(w({ title: '' }))
  await assertSucceeds(w({ type: 'withdraw' }))
})
