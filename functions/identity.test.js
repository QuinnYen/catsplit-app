import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identityKey, isInternalUid, makeUid, resolveLineUid } from './identity.js'

test('makeUid：u_ 加 20 位十六進位，不以 p_ 開頭', () => {
  const uid = makeUid()
  assert.match(uid, /^u_[0-9a-f]{20}$/)
  assert.equal(isInternalUid(uid), true)
  assert.equal(uid.startsWith('p_'), false)
})

test('makeUid：可注入亂數，補零正確', () => {
  assert.equal(makeUid(() => new Uint8Array(10)), 'u_00000000000000000000')
  assert.equal(makeUid(() => Uint8Array.from([255, 1, 2, 3, 4, 5, 6, 7, 8, 16])), 'u_ff010203040506070810')
})

test('makeUid：連續產生不重複', () => {
  const set = new Set(Array.from({ length: 200 }, () => makeUid()))
  assert.equal(set.size, 200)
})

test('isInternalUid：LINE userId、訪客 id、空值都不是內部 uid', () => {
  assert.equal(isInternalUid('U' + 'a'.repeat(32)), false)
  assert.equal(isInternalUid('p_' + 'a'.repeat(20)), false)
  assert.equal(isInternalUid('u_xyz'), false)
  assert.equal(isInternalUid(undefined), false)
})

test('identityKey：provider:subject', () => {
  assert.equal(identityKey('line', 'U' + 'a'.repeat(32)), 'line:U' + 'a'.repeat(32))
  assert.equal(identityKey('google', '112233445566778899'), 'google:112233445566778899')
})

test('identityKey：拒絕未知 provider 與不安全的 subject', () => {
  assert.throws(() => identityKey('apple', 'x'), /invalid_provider/)
  assert.throws(() => identityKey('line', ''), /invalid_subject/)
  assert.throws(() => identityKey('line', 'a/b'), /invalid_subject/)
  assert.throws(() => identityKey('line', '..'), /invalid_subject/)
  assert.throws(() => identityKey('line', undefined), /invalid_subject/)
  assert.throws(() => identityKey('line', 'a'.repeat(129)), /invalid_subject/)
})

test('resolveLineUid：對照表已有就用對照表的 uid，不重建', () => {
  assert.deepEqual(
    resolveLineUid({ identity: { uid: 'u_00000000000000000001' }, lineUserId: 'Uabc' }),
    { uid: 'u_00000000000000000001', create: false },
  )
})

test('resolveLineUid：對照表沒有就沿用 LINE userId 並要求建立', () => {
  assert.deepEqual(resolveLineUid({ identity: null, lineUserId: 'Uabc' }), { uid: 'Uabc', create: true })
  assert.deepEqual(resolveLineUid({ identity: {}, lineUserId: 'Uabc' }), { uid: 'Uabc', create: true })
  assert.deepEqual(resolveLineUid({ identity: { uid: '' }, lineUserId: 'Uabc' }), { uid: 'Uabc', create: true })
})
