// 匯率換算頁個人設定（users/{uid}/settings/fx）的 rules 測試；需要 firestore emulator，用 npm run test:rules 執行
import { test, before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore'

let env
const dbAs = (uid, claims) => env.authenticatedContext(uid, claims).firestore()
const fxDoc = (db, uid) => doc(db, 'users', uid, 'settings', 'fx')

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-catsplit-fxsettings',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
})

after(async () => {
  await env?.cleanup()
})

test('本人可寫入、讀取、更新、刪除自己的設定；空文件也可以（全部選填）', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(fxDoc(db, 'u1'), {}))
  await assertSucceeds(setDoc(fxDoc(db, 'u1'), { decimals: 1, defaultAmount: 1, showSymbol: true, taxFreePercent: 10, cardFeePercent: 1.5, customRates: { JPY_TWD: 0.2 } }))
  await assertSucceeds(getDoc(fxDoc(db, 'u1')))
  await assertSucceeds(updateDoc(fxDoc(db, 'u1'), { decimals: 2 }))
  await assertSucceeds(setDoc(fxDoc(db, 'u1'), { cardFeePercent: 2 }, { merge: true })) // 設定頁用 merge 存單一欄位
  await assertSucceeds(deleteDoc(fxDoc(db, 'u1')))
})

test('別人不能讀寫我的設定，未登入與訪客不能寫', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(fxDoc(ctx.firestore(), 'u1'), { decimals: 1 }) })
  const other = dbAs('u2')
  await assertFails(getDoc(fxDoc(other, 'u1')))
  await assertFails(setDoc(fxDoc(other, 'u1'), { decimals: 2 }))
  await assertFails(deleteDoc(fxDoc(other, 'u1')))
  await assertFails(getDoc(fxDoc(env.unauthenticatedContext().firestore(), 'u1')))
  await assertFails(setDoc(fxDoc(dbAs('u1', { guest: true }), 'u1'), { decimals: 2 }))
})

test('欄位驗證：小數位數、預設金額、符號、百分比、自訂匯率數量、未知欄位', async () => {
  const db = dbAs('u1')
  const w = (data) => setDoc(fxDoc(db, 'u1'), data)
  await assertSucceeds(w({ decimals: 0 }))
  await assertSucceeds(w({ decimals: 3 }))
  await assertFails(w({ decimals: 4 }))
  await assertFails(w({ decimals: -1 }))
  await assertFails(w({ decimals: 1.5 }))
  await assertFails(w({ decimals: '1' }))
  for (const field of ['serviceFeePercent', 'addTaxPercent', 'tipPercent']) {
    await assertSucceeds(w({ [field]: 10 }))
    await assertFails(w({ [field]: 101 }))
    await assertFails(w({ [field]: -1 }))
  }
  await assertSucceeds(w({ showShortcuts: { card: true, taxFree: true, service: false, addTax: false, tip: false } }))
  await assertFails(w({ showShortcuts: 'x' }))
  await assertSucceeds(w({ customShortcuts: [{ id: 'a', name: '折扣', percent: 5, kind: 'deduct' }] }))
  await assertFails(w({ customShortcuts: Array.from({ length: 9 }, (_, i) => ({ id: `i${i}`, name: 'n', percent: 1, kind: 'add' })) }))
  await assertFails(w({ customShortcuts: 'x' }))
  await assertSucceeds(w({ rows: ['TWD', 'JPY', 'USD'] }))
  await assertSucceeds(w({ rows: ['JPY'] }))
  await assertFails(w({ rows: [] }))
  await assertFails(w({ rows: ['TWD', 'JPY', 'USD', 'EUR', 'CNY', 'KRW', 'HKD'] }))
  await assertFails(w({ rows: 'TWD' }))
  await assertSucceeds(w({ defaultAmount: 0 }))
  await assertSucceeds(w({ defaultAmount: 100.5 }))
  await assertFails(w({ defaultAmount: -1 }))
  await assertFails(w({ defaultAmount: 1000000000 }))
  await assertFails(w({ defaultAmount: '1' }))
  await assertSucceeds(w({ showSymbol: false }))
  await assertFails(w({ showSymbol: 'yes' }))
  await assertSucceeds(w({ taxFreePercent: 0, cardFeePercent: 100 }))
  await assertFails(w({ taxFreePercent: -0.1 }))
  await assertFails(w({ cardFeePercent: 100.1 }))
  await assertFails(w({ cardFeePercent: '1.5' }))
  await assertFails(w({ extra: 1 }))
  const rates = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`R${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}_TWD`, 1]))
  await assertSucceeds(w({ customRates: rates(20) }))
  await assertFails(w({ customRates: rates(21) }))
  await assertFails(w({ customRates: [1, 2] }))
  await assertFails(w({ customRates: 'JPY_TWD' }))
})

test('自訂匯率整個欄位以 mergeFields 寫入：可以刪掉其中一組，也可以清空，不影響其他欄位', async () => {
  const db = dbAs('u1')
  await assertSucceeds(setDoc(fxDoc(db, 'u1'), { decimals: 2, customRates: { JPY_TWD: 0.2, USD_TWD: 31.5 } }))
  await assertSucceeds(setDoc(fxDoc(db, 'u1'), { customRates: { USD_TWD: 31.5 } }, { mergeFields: ['customRates'] }))
  const after = (await getDoc(fxDoc(db, 'u1'))).data()
  assert.deepEqual(after, { decimals: 2, customRates: { USD_TWD: 31.5 } }) // JPY_TWD 真的被刪掉，decimals 還在
  await assertSucceeds(setDoc(fxDoc(db, 'u1'), { customRates: {} }, { mergeFields: ['customRates'] }))
  assert.deepEqual((await getDoc(fxDoc(db, 'u1'))).data(), { decimals: 2, customRates: {} })
})
