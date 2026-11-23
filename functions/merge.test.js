import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isGuestUid, assertMergeable, chooseKeepUid, classifyGroups, isSelfTransferAfterMove, countMigrationImpact,
  defaultResolution, classifyPersonalConflicts, buildResolutions, AUTO_RESOLVED_PATHS,
} from './merge.js'
import { MIGRATION_FIELDS, migrationPatch } from './migrate.js'
import { computeMemberBalances } from '../src/utils/expenseHelpers.js'

const KEEP = 'U' + 'a'.repeat(32)
const DROP = 'u_00000000000000000001'
const THIRD = 'U' + 'c'.repeat(32)

// ---------- 帳號檢查與保留對象 ----------

test('isGuestUid 與 assertMergeable：訪客、空值、相同 uid 都不能合併', () => {
  assert.equal(isGuestUid('p_abc'), true)
  assert.equal(isGuestUid(KEEP), false)
  assert.doesNotThrow(() => assertMergeable(KEEP, DROP))
  assert.throws(() => assertMergeable('p_abc', DROP), /guest_not_mergeable/)
  assert.throws(() => assertMergeable(KEEP, 'p_abc'), /guest_not_mergeable/)
  assert.throws(() => assertMergeable(KEEP, KEEP), /same_uid/)
  assert.throws(() => assertMergeable('', DROP), /invalid_uid/)
  assert.throws(() => assertMergeable(KEEP, undefined), /invalid_uid/)
})

test('chooseKeepUid：群組較多者保留，一樣多時保留第一個', () => {
  assert.deepEqual(chooseKeepUid({ uid: 'a', groupCount: 1 }, { uid: 'b', groupCount: 3 }), { keepUid: 'b', dropUid: 'a' })
  assert.deepEqual(chooseKeepUid({ uid: 'a', groupCount: 4 }, { uid: 'b', groupCount: 3 }), { keepUid: 'a', dropUid: 'b' })
  assert.deepEqual(chooseKeepUid({ uid: 'a', groupCount: 2 }, { uid: 'b', groupCount: 2 }), { keepUid: 'a', dropUid: 'b' })
  assert.deepEqual(chooseKeepUid({ uid: 'a', groupCount: 0 }, { uid: 'b', groupCount: 0 }), { keepUid: 'a', dropUid: 'b' })
})

// ---------- 群組分類 ----------

test('classifyGroups：兩邊都在與只有被併入帳號在分開，沒有被併入帳號的群組略過', () => {
  const groups = [
    { id: 'g1', name: 'A', members: [KEEP, DROP, THIRD] },
    { id: 'g2', name: 'B', members: [DROP, THIRD] },
    { id: 'g3', name: 'C', members: [KEEP, THIRD] },
    { id: 'g4', members: [DROP] },
  ]
  assert.deepEqual(classifyGroups(groups, KEEP, DROP), {
    bothIn: [{ id: 'g1', name: 'A' }],
    dropOnly: [{ id: 'g2', name: 'B' }, { id: 'g4', name: null }],
  })
  assert.deepEqual(classifyGroups([], KEEP, DROP), { bothIn: [], dropOnly: [] })
})

// ---------- 自己轉給自己 ----------

test('isSelfTransferAfterMove：兩個帳號互轉會變成自己轉給自己，與第三人的轉帳不會', () => {
  assert.equal(isSelfTransferAfterMove({ from: KEEP, to: DROP }, DROP, KEEP), true)
  assert.equal(isSelfTransferAfterMove({ from: DROP, to: KEEP }, DROP, KEEP), true)
  assert.equal(isSelfTransferAfterMove({ from: DROP, to: THIRD }, DROP, KEEP), false)
  assert.equal(isSelfTransferAfterMove({ from: THIRD, to: KEEP }, DROP, KEEP), false)
})

test('合併後刪掉自己轉給自己的轉帳，重算的餘額等於合併前兩人餘額相加（轉帳是對沖）', () => {
  const expenses = [
    { payments: { [DROP]: 90 }, splits: { [KEEP]: 30, [DROP]: 30, [THIRD]: 30 } },
    { payments: { [KEEP]: 40, [THIRD]: 20 }, splits: { [KEEP]: 20, [DROP]: 20, [THIRD]: 20 } },
  ]
  const settlements = [
    { from: KEEP, to: DROP, amount: 20 }, // 合併後變成自己轉給自己
    { from: DROP, to: KEEP, amount: 5 }, // 同上
    { from: THIRD, to: DROP, amount: 10 },
    { from: KEEP, to: THIRD, amount: 7 },
  ]
  const before = computeMemberBalances([KEEP, DROP, THIRD], expenses, settlements)
  const expectedKeep = before[KEEP] + before[DROP]

  const move = (docs, fields) => docs.map((d) => ({ ...d, ...migrationPatch(d, fields, DROP, KEEP) }))
  const movedSettlements = move(settlements, MIGRATION_FIELDS.settlements).filter((s) => s.from !== s.to)
  assert.equal(movedSettlements.length, 2) // 兩筆自付轉帳被刪掉
  const after = computeMemberBalances([KEEP, THIRD], move(expenses, MIGRATION_FIELDS.expenses), movedSettlements)

  assert.ok(Math.abs(after[KEEP] - expectedKeep) < 0.005, `${after[KEEP]} vs ${expectedKeep}`)
  assert.ok(Math.abs(after[THIRD] - before[THIRD]) < 0.005)
})

test('countMigrationImpact：各集合被改動的筆數與會被刪除的自己轉給自己的轉帳', () => {
  const impact = countMigrationImpact({
    expenses: [{ payments: { [DROP]: 10 }, splits: { [DROP]: 5, [THIRD]: 5 }, createdBy: DROP }, { payments: { [THIRD]: 1 }, splits: { [THIRD]: 1 } }],
    settlements: [
      { from: KEEP, to: DROP, amount: 1 },
      { from: DROP, to: THIRD, amount: 2 },
      { from: THIRD, to: KEEP, amount: 3 },
    ],
    incomes: [{ received: { [DROP]: 4 }, splits: { [DROP]: 4 } }],
  }, DROP, KEEP)
  assert.deepEqual(impact, { expenses: 1, settlements: 2, incomes: 1, selfTransfers: 1 })
  assert.deepEqual(countMigrationImpact({}, DROP, KEEP), { expenses: 0, settlements: 0, incomes: 0, selfTransfers: 0 })
})

// ---------- 個人資料衝突 ----------

test('defaultResolution：較新的那份，一樣新就保留 keepUid 的', () => {
  assert.equal(defaultResolution({ keepUpdatedMs: 100, dropUpdatedMs: 200 }), 'drop')
  assert.equal(defaultResolution({ keepUpdatedMs: 200, dropUpdatedMs: 100 }), 'keep')
  assert.equal(defaultResolution({ keepUpdatedMs: 100, dropUpdatedMs: 100 }), 'keep')
})

const profileConflict = { path: 'settings/profile', keepUpdatedMs: 100, dropUpdatedMs: 200 }
const promptConflict = { path: 'settings/oaPrompt', keepUpdatedMs: 300, dropUpdatedMs: 200 }
const ledgerConflict = { path: 'transactions/group_g1', keepUpdatedMs: 100, dropUpdatedMs: 50 }

test('classifyPersonalConflicts：oaPrompt 自動處理，其他需要使用者決定，各附預設建議', () => {
  assert.deepEqual(AUTO_RESOLVED_PATHS, ['settings/oaPrompt'])
  const { auto, needsChoice } = classifyPersonalConflicts([profileConflict, promptConflict, ledgerConflict])
  assert.deepEqual(auto.map((c) => [c.path, c.suggested]), [['settings/oaPrompt', 'keep']])
  // 要使用者決定的一律預設保留 keepUid，即使被併入帳號的資料比較新（profileConflict 的 drop 較新）
  assert.deepEqual(needsChoice.map((c) => [c.path, c.suggested]), [['settings/profile', 'keep'], ['transactions/group_g1', 'keep']])
})

test('buildResolutions：沒指定就用預設建議，指定的以使用者為準，自動處理的一律用預設建議', () => {
  const all = [profileConflict, promptConflict, ledgerConflict]
  assert.deepEqual(buildResolutions(all), {
    'settings/oaPrompt': 'keep', 'settings/profile': 'keep', 'transactions/group_g1': 'keep',
  })
  assert.deepEqual(buildResolutions(all, { 'settings/profile': 'keep', 'transactions/group_g1': 'drop' }), {
    'settings/oaPrompt': 'keep', 'settings/profile': 'keep', 'transactions/group_g1': 'drop',
  })
  assert.deepEqual(buildResolutions([]), {})
})

test('buildResolutions：不存在或不需要決定的路徑、不合法的值會丟錯，不靜默忽略', () => {
  const all = [profileConflict, promptConflict]
  assert.throws(() => buildResolutions(all, { 'settings/nope': 'keep' }), /unknown_conflict_path/)
  assert.throws(() => buildResolutions(all, { 'settings/oaPrompt': 'drop' }), /unknown_conflict_path/)
  assert.throws(() => buildResolutions(all, { 'settings/profile': 'both' }), /invalid_resolution/)
  assert.throws(() => buildResolutions(all, { 'settings/profile': undefined }), /invalid_resolution/)
})
