import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balanceDeltas, deltasForChange, computeBalance } from './balance.js'

const expense = (o = {}) => ({ type: 'expense', accountId: 'a', amount: 100, currency: 'TWD', source: { type: 'manual' }, ...o })
const income = (o = {}) => ({ type: 'income', accountId: 'a', amount: 500, currency: 'TWD', source: { type: 'manual' }, ...o })
const transfer = (o = {}) => ({ type: 'transfer', accountId: 'a', amount: 4200, currency: 'TWD', toAccountId: 'b', toAmount: 20000, source: { type: 'manual' }, ...o })

test('支出減少帳戶餘額、收入增加', () => {
  assert.deepEqual(balanceDeltas(expense()), { a: -100 })
  assert.deepEqual(balanceDeltas(income()), { a: 500 })
})

test('跨幣別帳目以扣款金額計算餘額', () => {
  assert.deepEqual(balanceDeltas(expense({ currency: 'JPY', amount: 14500, accountAmount: 3050 })), { a: -3050 })
  assert.deepEqual(balanceDeltas(income({ currency: 'USD', amount: 10, accountAmount: 315 })), { a: 315 })
})

test('轉帳：轉出帳戶減轉出金額、轉入帳戶加轉入金額（可不同幣別）', () => {
  assert.deepEqual(balanceDeltas(transfer()), { a: -4200, b: 20000 })
})

test('快照帳目（群組同步、尚未匯入）不影響餘額；匯入後（detached）才計入', () => {
  const group = { type: 'group', groupId: 'g', kind: 'expense', itemId: 'e' }
  assert.deepEqual(balanceDeltas(expense({ source: group })), {})
  assert.deepEqual(balanceDeltas(expense({ source: { ...group, detached: true } })), { a: -100 })
})

test('沒有帳目時沒有增量', () => {
  assert.deepEqual(balanceDeltas(null), {})
  assert.deepEqual(balanceDeltas(undefined), {})
})

test('deltasForChange：新增、刪除、編輯', () => {
  assert.deepEqual(deltasForChange(null, expense()), { a: -100 })
  assert.deepEqual(deltasForChange(expense(), null), { a: 100 })
  assert.deepEqual(deltasForChange(expense(), expense({ amount: 150 })), { a: -50 })
})

test('deltasForChange：換帳戶、改種類，沒有變化的不出現', () => {
  assert.deepEqual(deltasForChange(expense(), expense({ accountId: 'b', amount: 150 })), { a: 100, b: -150 })
  assert.deepEqual(deltasForChange(expense(), income()), { a: 600 })
  assert.deepEqual(deltasForChange(expense(), expense({ title: '改備註' })), {})
  assert.deepEqual(deltasForChange(transfer(), transfer({ toAmount: 21000 })), { b: 1000 })
})

test('deltasForChange：快照帳目匯入成一般帳目時才出現增量', () => {
  const snap = expense({ source: { type: 'group', groupId: 'g', kind: 'expense', itemId: 'e' } })
  const imported = { ...snap, accountId: 'b', source: { ...snap.source, detached: true } }
  assert.deepEqual(deltasForChange(snap, imported), { b: -100 })
})

test('computeBalance：初始餘額加上該帳戶的所有帳目，略過快照與無關帳戶', () => {
  const a = { id: 'a', initialBalance: 1000 }
  const txs = [
    expense(), // −100
    income(), // +500
    transfer(), // −4200 (a → b)
    transfer({ accountId: 'b', toAccountId: 'a', amount: 20000, toAmount: 4000 }), // +4000
    expense({ accountId: 'c', amount: 999 }),
    expense({ source: { type: 'group', groupId: 'g', kind: 'expense', itemId: 'e' } }),
  ]
  assert.equal(computeBalance(a, txs), 1000 - 100 + 500 - 4200 + 4000)
})

test('computeBalance：小數不累積誤差、信用卡可為負', () => {
  const card = { id: 'a', initialBalance: -7590 }
  assert.equal(computeBalance(card, [expense({ amount: 0.1 }), expense({ amount: 0.2 })]), -7590.3)
  assert.equal(computeBalance({ id: 'a', initialBalance: 0 }, [expense({ amount: 0.1 }), income({ amount: 0.1 })]), 0)
})
