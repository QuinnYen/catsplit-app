// 官方帳號加好友提示旗標（users/{uid}/settings/oaPrompt）的 rules 測試；需要 firestore emulator，用 npm run test:rules 執行
import { test, before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'

let env
const dbAs = (uid, claims) => env.authenticatedContext(uid, claims).firestore()
const flagDoc = (db, uid) => doc(db, 'users', uid, 'settings', 'oaPrompt')

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-catsplit-oaprompt',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
})

after(async () => {
  await env?.cleanup()
})

test('本人可寫入、讀取、刪除自己的提示旗標', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(flagDoc(db, 'u1'), { promptedAt: serverTimestamp() }))
  await assertSucceeds(getDoc(flagDoc(db, 'u1')))
  await assertSucceeds(deleteDoc(flagDoc(db, 'u1')))
})

test('別人不能讀寫我的提示旗標', async () => {
  await assertFails(setDoc(flagDoc(dbAs('u2'), 'u1'), { promptedAt: serverTimestamp() }))
  await assertFails(getDoc(flagDoc(dbAs('u2'), 'u1')))
})

test('訪客 token 不能寫提示旗標', async () => {
  await assertFails(setDoc(flagDoc(dbAs('u1', { guest: true }), 'u1'), { promptedAt: serverTimestamp() }))
})

test('promptedAt 必須是時間、不能有其他欄位', async () => {
  const db = dbAs('u1')
  await assertFails(setDoc(flagDoc(db, 'u1'), { promptedAt: 'yesterday' }))
  await assertFails(setDoc(flagDoc(db, 'u1'), { promptedAt: serverTimestamp(), extra: 1 }))
  await assertFails(setDoc(flagDoc(db, 'u1'), {}))
})
