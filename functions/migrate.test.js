import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveKey, MIGRATION_FIELDS, migrationPatch } from './migrate.js'
import { computeMemberBalances } from '../src/utils/expenseHelpers.js'

// 修改前 migrateMember 內的 patch 計算（原樣保留當 oracle，確認抽成純函式後行為不變）
const legacyExpensePatch = (e, fromId, toUid) => {
  const patch = {}
  for (const field of ['payments', 'splits', 'shares']) {
    const moved = moveKey(e[field], fromId, toUid)
    if (moved) patch[field] = moved
  }
  if (e.createdBy === fromId) patch.createdBy = toUid
  return Object.keys(patch).length ? patch : null
}
const legacySettlementPatch = (s, fromId, toUid) => {
  const patch = {}
  for (const field of ['from', 'to', 'settledBy']) {
    if (s[field] === fromId) patch[field] = toUid
  }
  return Object.keys(patch).length ? patch : null
}

const expense = { amount: 90.5, payments: { p_x: 90.5 }, splits: { p_x: 30.17, u_y: 30.17, u_z: 30.16 }, shares: { p_x: 1, u_y: 1 }, createdBy: 'p_x' }
const expenseOther = { amount: 10, payments: { u_y: 10 }, splits: { u_y: 5, u_z: 5 }, createdBy: 'u_y' }
const settlement = { from: 'p_x', to: 'u_z', amount: 12.34, settledBy: 'p_x' }
const settlementOther = { from: 'u_y', to: 'u_z', amount: 5, settledBy: 'u_y' }
const income = { amount: 100.25, received: { p_x: 60.15, u_z: 40.1 }, splits: { p_x: 33.42, u_y: 33.42, u_z: 33.41 }, shares: { p_x: 1 }, createdBy: 'p_x' }
const incomeOther = { amount: 20, received: { u_y: 20 }, splits: { u_y: 10, u_z: 10 }, createdBy: 'u_y' }

test('migrationPatch：支出的結果與修改前的邏輯完全相同', () => {
  for (const e of [expense, expenseOther, {}]) {
    assert.deepStrictEqual(migrationPatch(e, MIGRATION_FIELDS.expenses, 'p_x', 'u_new'), legacyExpensePatch(e, 'p_x', 'u_new'))
  }
})

test('migrationPatch：轉帳的結果與修改前的邏輯完全相同', () => {
  for (const s of [settlement, settlementOther, {}]) {
    assert.deepStrictEqual(migrationPatch(s, MIGRATION_FIELDS.settlements, 'p_x', 'u_new'), legacySettlementPatch(s, 'p_x', 'u_new'))
  }
})

test('migrationPatch：沒有需要改的文件回傳 null', () => {
  assert.equal(migrationPatch(incomeOther, MIGRATION_FIELDS.incomes, 'p_x', 'u_new'), null)
})

test('migrationPatch：收入的 received、splits、shares、createdBy 都會轉移，不再出現舊 id', () => {
  const patch = migrationPatch(income, MIGRATION_FIELDS.incomes, 'p_x', 'u_new')
  const next = { ...income, ...patch }
  assert.ok(!('p_x' in next.received) && !('p_x' in next.splits) && !('p_x' in next.shares))
  assert.equal(next.createdBy, 'u_new')
  assert.equal(next.received.u_new, 60.15)
})

test('轉移後以文件重算的餘額，與 moveKey 轉移群組餘額的結果一致（差 < 0.005）', () => {
  const members = ['p_x', 'u_y', 'u_z']
  const expenses = [expense, expenseOther]
  const settlements = [settlement, settlementOther]
  const incomes = [income, incomeOther]
  const before = computeMemberBalances(members, expenses, settlements, incomes)
  const movedBalances = moveKey(before, 'p_x', 'u_new')

  const apply = (docs, fields) => docs.map((d) => ({ ...d, ...migrationPatch(d, fields, 'p_x', 'u_new') }))
  const after = computeMemberBalances(
    ['u_new', 'u_y', 'u_z'],
    apply(expenses, MIGRATION_FIELDS.expenses),
    apply(settlements, MIGRATION_FIELDS.settlements),
    apply(incomes, MIGRATION_FIELDS.incomes),
  )
  assert.ok(!('p_x' in after))
  for (const uid of ['u_new', 'u_y', 'u_z']) {
    assert.ok(Math.abs(after[uid] - movedBalances[uid]) < 0.005, `${uid}: ${after[uid]} vs ${movedBalances[uid]}`)
  }
})
