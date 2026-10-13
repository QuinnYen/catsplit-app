// 群組預算的 rules 測試；需要 firestore emulator，用 npm run test:rules 執行（會占用 8080 埠）
import { test, before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, increment, deleteField, arrayUnion } from 'firebase/firestore'

const GID = 'g1'
let env

const baseGroup = () => ({
  name: 'Trip',
  createdBy: 'owner',
  members: ['owner', 'mem', 'p_guest'],
  memberProfiles: { owner: { name: 'Owner' }, mem: { name: 'Mem' }, p_guest: { name: 'Guest', placeholder: true } },
  baseCurrency: 'TWD',
  totalAmount: 0,
  totalExpenses: 0,
  memberBalances: {},
})

const seed = (extra = {}) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups', GID), { ...baseGroup(), ...extra }))

const groupAs = (uid, claims) => doc(env.authenticatedContext(uid, claims).firestore(), 'groups', GID)

// 與 AddExpensePage 新增支出時對群組文件的更新相同形狀
const accountingUpdate = (uid) => ({
  totalAmount: increment(300),
  totalExpenses: increment(1),
  [`memberBalances.${uid}`]: increment(200),
  lastActivity: { at: new Date(), by: uid, name: 'x', type: 'expense_add', title: 'Lunch' },
})

const tripBudget = (amount) => ({ amount, period: { type: 'trip' } })

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-catsplit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
  await seed()
})

after(async () => {
  await env?.cleanup()
})

test('成員的一般記帳更新允許', async () => {
  await assertSucceeds(updateDoc(groupAs('mem'), accountingUpdate('mem')))
})

test('已有預算時，成員的一般記帳更新仍允許', async () => {
  await seed({ budget: tripBudget(1000) })
  await assertSucceeds(updateDoc(groupAs('mem'), accountingUpdate('mem')))
})

test('訪客 token 的一般記帳更新允許', async () => {
  await assertSucceeds(updateDoc(groupAs('p_guest', { guest: true }), accountingUpdate('p_guest')))
})

test('成員只改群組名稱允許', async () => {
  await assertSucceeds(updateDoc(groupAs('mem'), { name: 'New name' }))
})

test('非建立者寫 budget 被拒', async () => {
  await assertFails(updateDoc(groupAs('mem'), { budget: tripBudget(1000) }))
})

test('訪客寫 budget 被拒', async () => {
  await assertFails(updateDoc(groupAs('p_guest', { guest: true }), { budget: tripBudget(1000) }))
})

test('非建立者在同一次更新夾帶 budget 與彙總欄位被拒', async () => {
  await assertFails(updateDoc(groupAs('mem'), { ...accountingUpdate('mem'), budget: tripBudget(1000) }))
})

test('非建立者清除 budget 被拒', async () => {
  await seed({ budget: tripBudget(1000) })
  await assertFails(updateDoc(groupAs('mem'), { budget: deleteField() }))
})

test('建立者設定、修改、清除 budget 允許', async () => {
  const ref = groupAs('owner')
  await assertSucceeds(updateDoc(ref, { budget: tripBudget(1000) }))
  await assertSucceeds(updateDoc(ref, { budget: tripBudget(2500.5) }))
  await assertSucceeds(updateDoc(ref, { budget: deleteField() }))
})

test('建立者寫 amount <= 0 被拒', async () => {
  await assertFails(updateDoc(groupAs('owner'), { budget: tripBudget(0) }))
  await assertFails(updateDoc(groupAs('owner'), { budget: tripBudget(-5) }))
})

test('建立者寫非數字 amount 被拒', async () => {
  await assertFails(updateDoc(groupAs('owner'), { budget: tripBudget('1000') }))
})

test('建立者寫超過上限的 amount 被拒', async () => {
  await assertFails(updateDoc(groupAs('owner'), { budget: tripBudget(1e12) }))
})

test('建立者寫多出未知欄位被拒', async () => {
  await assertFails(updateDoc(groupAs('owner'), { budget: { ...tripBudget(1000), warnAt: 0.5 } }))
})

test('建立者寫 period 非 map 被拒', async () => {
  await assertFails(updateDoc(groupAs('owner'), { budget: { amount: 1000, period: 'trip' } }))
})

test('建立者寫缺少 period.type 被拒', async () => {
  await assertFails(updateDoc(groupAs('owner'), { budget: { amount: 1000, period: {} } }))
})

test('非成員加入群組仍允許', async () => {
  await assertSucceeds(updateDoc(groupAs('newbie'), {
    members: arrayUnion('newbie'),
    'memberProfiles.newbie': { name: 'Newbie' },
  }))
})

test('非成員加入時夾帶 budget 被拒', async () => {
  await assertFails(updateDoc(groupAs('newbie'), {
    members: arrayUnion('newbie'),
    'memberProfiles.newbie': { name: 'Newbie' },
    budget: tripBudget(1000),
  }))
})

test('成員新增虛擬成員仍允許', async () => {
  await assertSucceeds(updateDoc(groupAs('mem'), {
    members: arrayUnion('p_new'),
    'memberProfiles.p_new': { name: 'New', placeholder: true },
  }))
})
