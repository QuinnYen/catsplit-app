import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ledgersPath, ledgerPath, accountsPath, transactionsPath, groupLinksPath, snapshotAccountId, syncedTxId, tripsPath } from './paths.js'

test('路徑：帳本、帳戶、帳目、群組連結', () => {
  assert.deepEqual(ledgersPath('u1'), ['users', 'u1', 'ledgers'])
  assert.deepEqual(ledgerPath('u1', 'l1'), ['users', 'u1', 'ledgers', 'l1'])
  assert.deepEqual(accountsPath('u1', 'l1'), ['users', 'u1', 'ledgers', 'l1', 'accounts'])
  assert.deepEqual(transactionsPath('u1', 'l1'), ['users', 'u1', 'ledgers', 'l1', 'transactions'])
  assert.deepEqual(groupLinksPath('u1', 'l1'), ['users', 'u1', 'ledgers', 'l1', 'groupLinks'])
  assert.deepEqual(tripsPath('u1', 'l1'), ['users', 'u1', 'ledgers', 'l1', 'trips'])
})

test('快照帳戶與同步帳目的 id 固定', () => {
  assert.equal(snapshotAccountId('g1'), 'snap_g1')
  assert.equal(syncedTxId('g1', 'expense', 'e9'), 'g_g1_e_e9')
  assert.equal(syncedTxId('g1', 'income', 'i3'), 'g_g1_i_i3')
  assert.notEqual(syncedTxId('g1', 'expense', 'x'), syncedTxId('g1', 'income', 'x'))
})
