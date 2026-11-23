// identities / merges / mergeBackups 只有雲端函式（Admin SDK）能讀寫，客戶端一律拒絕；需要 firestore emulator，用 npm run test:rules 執行
import { test, before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore'

let env
const dbAs = (uid, claims) => env.authenticatedContext(uid, claims).firestore()
const anon = () => env.unauthenticatedContext().firestore()

const COLLECTIONS = [
  ['identities', 'line:Uabc'],
  ['merges', 'm1'],
  ['mergeBackups', 'b1'],
]

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-catsplit-identities',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [col, id] of COLLECTIONS) {
      await setDoc(doc(ctx.firestore(), col, id), { uid: 'Uabc' })
    }
  })
})

after(async () => {
  await env?.cleanup()
})

for (const [col, id] of COLLECTIONS) {
  test(`${col}：登入使用者不能讀、寫、刪`, async () => {
    const db = dbAs('Uabc')
    await assertFails(getDoc(doc(db, col, id)))
    await assertFails(setDoc(doc(db, col, id), { uid: 'Uabc' }))
    await assertFails(setDoc(doc(db, col, 'new'), { uid: 'Uabc' }))
    await assertFails(deleteDoc(doc(db, col, id)))
  })

  test(`${col}：未登入與訪客也不能讀寫`, async () => {
    await assertFails(getDoc(doc(anon(), col, id)))
    await assertFails(setDoc(doc(anon(), col, 'new'), { uid: 'x' }))
    const guest = dbAs('p_abc', { guest: true })
    await assertFails(getDoc(doc(guest, col, id)))
    await assertFails(setDoc(doc(guest, col, 'new'), { uid: 'x' }))
  })
}

test('對照表資料確實存在（排除測試只是因為文件不存在而失敗）', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'identities', 'line:Uabc')))
  })
})
