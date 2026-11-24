import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readLastUsed, writeLastUsed, readActiveLedgerId, writeActiveLedgerId, pickActiveLedgerId, pickEntryDefaults } from './prefs.js'

const memory = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }
}
const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }

test('最近使用：寫入會合併，不同帳本與使用者互不影響', () => {
  const s = memory()
  assert.deepEqual(readLastUsed(s, 'u1', 'l1'), {})
  writeLastUsed(s, 'u1', 'l1', { accountId: 'a1' })
  writeLastUsed(s, 'u1', 'l1', { expenseCategory: 'food' })
  assert.deepEqual(readLastUsed(s, 'u1', 'l1'), { accountId: 'a1', expenseCategory: 'food' })
  assert.deepEqual(readLastUsed(s, 'u1', 'l2'), {})
  assert.deepEqual(readLastUsed(s, 'u2', 'l1'), {})
})

test('最近使用：壞掉的內容與無法存取的 storage 都不會丟錯', () => {
  const s = memory()
  s.setItem('cs-ledger-last:u1:l1', '{not json')
  assert.deepEqual(readLastUsed(s, 'u1', 'l1'), {})
  s.setItem('cs-ledger-last:u1:l1', '"string"')
  assert.deepEqual(readLastUsed(s, 'u1', 'l1'), {})
  assert.deepEqual(readLastUsed(broken, 'u1', 'l1'), {})
  assert.doesNotThrow(() => writeLastUsed(broken, 'u1', 'l1', { accountId: 'a' }))
  assert.equal(readActiveLedgerId(broken, 'u1'), null)
  assert.doesNotThrow(() => writeActiveLedgerId(broken, 'u1', 'l1'))
})

test('目前帳本：讀寫與挑選', () => {
  const s = memory()
  assert.equal(readActiveLedgerId(s, 'u1'), null)
  writeActiveLedgerId(s, 'u1', 'l2')
  assert.equal(readActiveLedgerId(s, 'u1'), 'l2')
  assert.equal(readActiveLedgerId(s, 'u2'), null)
  const ledgers = [{ id: 'l1' }, { id: 'l2' }]
  assert.equal(pickActiveLedgerId(ledgers, 'l2'), 'l2')
  assert.equal(pickActiveLedgerId(ledgers, 'gone'), 'l1') // 存的帳本已被刪除
  assert.equal(pickActiveLedgerId(ledgers, null), 'l1')
  assert.equal(pickActiveLedgerId([], 'l1'), null)
})

test('新增帳目的預設：最近用的還在就沿用，否則第一個；快照與封存帳戶不能選', () => {
  const accounts = [
    { id: 'snap', kind: 'group' }, { id: 'old', kind: 'normal', archived: true }, { id: 'a1', kind: 'normal' }, { id: 'a2', kind: 'normal' },
  ]
  const categories = ['food', 'transport']
  assert.deepEqual(pickEntryDefaults({ accounts, kind: 'expense', categories }), { accountId: 'a1', category: 'food' })
  assert.deepEqual(pickEntryDefaults({ accounts, kind: 'expense', categories, last: { accountId: 'a2', expenseCategory: 'transport' } }), { accountId: 'a2', category: 'transport' })
  assert.deepEqual(pickEntryDefaults({ accounts, kind: 'expense', categories, last: { accountId: 'snap', expenseCategory: 'gone' } }), { accountId: 'a1', category: 'food' })
  assert.deepEqual(pickEntryDefaults({ accounts, kind: 'expense', categories, last: { accountId: 'old' } }).accountId, 'a1')
  // 收入與支出各記各的分類
  assert.equal(pickEntryDefaults({ accounts, kind: 'income', categories: ['salary', 'bonus'], last: { expenseCategory: 'transport', incomeCategory: 'bonus' } }).category, 'bonus')
  assert.deepEqual(pickEntryDefaults({ accounts: [], kind: 'expense', categories: [] }), { accountId: '', category: '' })
})
