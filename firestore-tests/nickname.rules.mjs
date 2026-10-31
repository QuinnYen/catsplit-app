// 全域暱稱（users/{uid}/settings/profile）與成員同步自己頭像／名字的 rules 測試；需要 firestore emulator，用 npm run test:rules 執行
import { test, before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore'

let env
const dbAs = (uid, claims) => env.authenticatedContext(uid, claims).firestore()
const profileDoc = (db, uid) => doc(db, 'users', uid, 'settings', 'profile')

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-catsplit-nickname',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
})

after(async () => {
  await env?.cleanup()
})

test('本人可寫入、讀取、刪除自己的暱稱', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(profileDoc(db, 'u1'), { nickname: '小明' }))
  await assertSucceeds(getDoc(profileDoc(db, 'u1')))
  await assertSucceeds(deleteDoc(profileDoc(db, 'u1')))
})

test('別人不能讀寫我的暱稱', async () => {
  await assertFails(setDoc(profileDoc(dbAs('u2'), 'u1'), { nickname: 'x' }))
  await assertFails(getDoc(profileDoc(dbAs('u2'), 'u1')))
})

test('訪客 token 不能寫暱稱', async () => {
  await assertFails(setDoc(profileDoc(dbAs('u1', { guest: true }), 'u1'), { nickname: 'x' }))
})

test('暱稱長度 1~20、必須是字串、不能有其他欄位', async () => {
  const db = dbAs('u1')
  await assertFails(setDoc(profileDoc(db, 'u1'), { nickname: '' }))
  await assertFails(setDoc(profileDoc(db, 'u1'), { nickname: 'a'.repeat(21) }))
  await assertFails(setDoc(profileDoc(db, 'u1'), { nickname: 123 }))
  await assertFails(setDoc(profileDoc(db, 'u1'), { nickname: 'ok', extra: 1 }))
  await assertSucceeds(setDoc(profileDoc(db, 'u1'), { nickname: 'a'.repeat(20) }))
})

test('成員可更新自己在群組的頭像與名字（同步用）', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups', 'g1'), {
    name: 'Trip', createdBy: 'owner', members: ['owner', 'u1'],
    memberProfiles: { owner: { name: 'Owner' }, u1: { name: 'Old', avatar: 'https://a/old' } },
  }))
  const ref = doc(dbAs('u1'), 'groups', 'g1')
  await assertSucceeds(updateDoc(ref, { 'memberProfiles.u1.avatar': 'https://a/new', 'memberProfiles.u1.name': 'New' }))
})
