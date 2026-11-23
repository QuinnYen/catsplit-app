import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LINK_CODE_TTL_MS, LINK_RECORD_TTL_MS, generateLinkCode, isLinkCodeFormat, hashLinkCode, buildLinkRecord, planRedeem,
} from './linkCode.js'

test('generateLinkCode：43 個 base64url 字元，每次不同', () => {
  const codes = Array.from({ length: 200 }, () => generateLinkCode())
  assert.ok(codes.every((c) => /^[A-Za-z0-9_-]{43}$/.test(c)))
  assert.equal(new Set(codes).size, 200)
})

test('isLinkCodeFormat：只接受剛好 43 個安全字元的字串', () => {
  assert.equal(isLinkCodeFormat(generateLinkCode()), true)
  for (const bad of [undefined, null, 123, '', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}/`, `${'a'.repeat(42)} `, `${'a'.repeat(42)}=`]) {
    assert.equal(isLinkCodeFormat(bad), false, String(bad))
  }
})

test('hashLinkCode：固定的 sha256 十六進位，不同的碼不同、看不出原碼', () => {
  const a = generateLinkCode()
  const b = generateLinkCode()
  assert.match(hashLinkCode(a), /^[0-9a-f]{64}$/)
  assert.equal(hashLinkCode(a), hashLinkCode(a))
  assert.notEqual(hashLinkCode(a), hashLinkCode(b))
  assert.ok(!hashLinkCode(a).includes(a))
  assert.equal(hashLinkCode('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('buildLinkRecord：到期時間與清除時間', () => {
  assert.deepEqual(buildLinkRecord({ uid: 'u_x', nowMs: 1000 }), {
    uid: 'u_x',
    createdAtMs: 1000,
    expiresAtMs: 1000 + LINK_CODE_TTL_MS,
    expireAtMs: 1000 + LINK_CODE_TTL_MS + LINK_RECORD_TTL_MS,
  })
  assert.equal(LINK_CODE_TTL_MS, 5 * 60 * 1000)
})

test('planRedeem：沒有紀錄是無效，逾時是 expired，有效才成功', () => {
  const record = buildLinkRecord({ uid: 'u_x', nowMs: 0 })
  assert.deepEqual(planRedeem(null, 1), { ok: false, error: 'link_invalid' })
  assert.deepEqual(planRedeem(record, 1), { ok: true })
  assert.deepEqual(planRedeem(record, LINK_CODE_TTL_MS - 1), { ok: true })
  assert.deepEqual(planRedeem(record, LINK_CODE_TTL_MS), { ok: false, error: 'link_expired' })
  assert.deepEqual(planRedeem(record, LINK_CODE_TTL_MS + 1), { ok: false, error: 'link_expired' })
})
