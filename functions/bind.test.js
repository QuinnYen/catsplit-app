import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MergeError, parseBindRequest, isFreshProof, decideBind, planUnbind,
  stateRank, isInProgress, mergeDocId, buildMergeRecord, planExecute, conflictsOf,
  MERGE_PREVIEW_TTL_MS, MERGE_PREVIEW_RECORD_TTL_MS,
} from './bind.js'

const ORIGINS = ['https://catsplit-app.web.app', 'http://localhost:5173']
const LINE = 'U' + 'a'.repeat(32)
const OTHER_LINE = 'U' + 'b'.repeat(32)
const G_UID = 'u_00000000000000000001'
const G_UID2 = 'u_00000000000000000002'

// ---------- 請求解析 ----------

test('parseBindRequest：三種合法形狀', () => {
  assert.deepEqual(parseBindRequest({ provider: 'google', idToken: 'abc' }, { allowedOrigins: ORIGINS }), { provider: 'google', idToken: 'abc' })
  assert.deepEqual(parseBindRequest({ provider: 'line', liffIdToken: 'abc' }, { allowedOrigins: ORIGINS }), { provider: 'line', liffIdToken: 'abc' })
  assert.deepEqual(
    parseBindRequest({ provider: 'line', code: 'c', redirectUri: 'https://catsplit-app.web.app/auth/callback' }, { allowedOrigins: ORIGINS }),
    { provider: 'line', code: 'c', redirectUri: 'https://catsplit-app.web.app/auth/callback' },
  )
})

test('parseBindRequest：其他形狀、過長、非我們網域的 redirectUri 都拒絕', () => {
  const bad = (body) => assert.throws(() => parseBindRequest(body, { allowedOrigins: ORIGINS }), (e) => e instanceof MergeError && e.code === 'invalid_request' && e.status === 400)
  bad(undefined)
  bad({})
  bad({ provider: 'apple', idToken: 'x' })
  bad({ provider: 'google' })
  bad({ provider: 'google', idToken: 'x'.repeat(4097) })
  bad({ provider: 'google', idToken: 123 })
  bad({ provider: 'line', code: 'c' })
  bad({ provider: 'line', code: 'c', redirectUri: 'https://evil.example/auth/callback' })
  bad({ provider: 'line', code: 'c', redirectUri: 'https://catsplit-app.web.app/other' })
  bad({ provider: 'line', code: 'c', redirectUri: 'https://catsplit-app.web.app.evil.example/auth/callback' })
})

test('isFreshProof：十分鐘內有效，太舊、沒有 iat、來自未來太久都不行', () => {
  const now = 1_700_000_000_000
  assert.equal(isFreshProof(now / 1000 - 5, now), true)
  assert.equal(isFreshProof(now / 1000 - 9 * 60, now), true)
  assert.equal(isFreshProof(now / 1000 - 11 * 60, now), false)
  assert.equal(isFreshProof(now / 1000 + 30, now), true) // 時鐘小誤差
  assert.equal(isFreshProof(now / 1000 + 600, now), false)
  assert.equal(isFreshProof(undefined, now), false)
  assert.equal(isFreshProof('1700000000', now), false)
})

// ---------- 綁定決策 ----------

test('decideBind：對照表已有，同一個 uid 是 already_bound，別的 uid 要合併', () => {
  assert.deepEqual(decideBind({ callerUid: G_UID, provider: 'line', subject: LINE, identity: { uid: G_UID } }), { action: 'already_bound' })
  assert.deepEqual(
    decideBind({ callerUid: G_UID, provider: 'line', subject: LINE, identity: { uid: LINE } }),
    { action: 'merge', otherUid: LINE, createIdentity: false },
  )
})

test('decideBind：對照表沒有、LINE 已是現有帳號的 uid（舊使用者）', () => {
  assert.deepEqual(
    decideBind({ callerUid: G_UID, provider: 'line', subject: LINE, identity: null, legacyLineExists: true }),
    { action: 'merge', otherUid: LINE, createIdentity: true },
  )
  assert.deepEqual(
    decideBind({ callerUid: LINE, provider: 'line', subject: LINE, identity: null, legacyLineExists: true }),
    { action: 'create_self' },
  )
})

test('decideBind：什麼都沒有就新增一筆；Google 沒有舊 uid 的概念，不看 legacyLineExists', () => {
  assert.deepEqual(decideBind({ callerUid: G_UID, provider: 'line', subject: LINE, identity: null, legacyLineExists: false }), { action: 'create' })
  assert.deepEqual(decideBind({ callerUid: LINE, provider: 'google', subject: '1122', identity: null, legacyLineExists: true }), { action: 'create' })
  assert.deepEqual(decideBind({ callerUid: LINE, provider: 'google', subject: '1122', identity: {} }), { action: 'create' })
})

// ---------- 解除綁定 ----------

const ids = (...list) => list.map(([id, uid, provider, subject]) => ({ id, uid, provider, subject }))

test('planUnbind：至少保留一種登入方式', () => {
  const only = ids(['line:' + LINE, LINE, 'line', LINE])
  assert.deepEqual(planUnbind({ callerUid: LINE, identities: only, targetId: 'line:' + LINE }), { ok: false, error: 'last_identity' })
})

test('planUnbind：找不到或不是自己的對照項', () => {
  const mine = ids(['google:1', G_UID, 'google', '1'], ['line:' + OTHER_LINE, G_UID, 'line', OTHER_LINE])
  assert.deepEqual(planUnbind({ callerUid: G_UID, identities: mine, targetId: 'google:999' }), { ok: false, error: 'identity_not_found' })
  assert.deepEqual(planUnbind({ callerUid: G_UID2, identities: mine, targetId: 'google:1' }), { ok: false, error: 'identity_not_found' })
})

test('planUnbind：一般情況刪除；舊 LINE 使用者自己的 LINE 要改指向新帳號，避免下次登入被懶建立回來', () => {
  const mine = ids(['google:1', G_UID, 'google', '1'], ['line:' + OTHER_LINE, G_UID, 'line', OTHER_LINE])
  assert.deepEqual(planUnbind({ callerUid: G_UID, identities: mine, targetId: 'google:1' }), { ok: true, mode: 'delete' })
  assert.deepEqual(planUnbind({ callerUid: G_UID, identities: mine, targetId: 'line:' + OTHER_LINE }), { ok: true, mode: 'delete' })
  const legacy = ids(['line:' + LINE, LINE, 'line', LINE], ['google:1', LINE, 'google', '1'])
  assert.deepEqual(planUnbind({ callerUid: LINE, identities: legacy, targetId: 'line:' + LINE }), { ok: true, mode: 'repoint' })
  assert.deepEqual(planUnbind({ callerUid: LINE, identities: legacy, targetId: 'google:1' }), { ok: true, mode: 'delete' })
})

// ---------- 合併紀錄 ----------

test('stateRank 與 isInProgress', () => {
  assert.deepEqual(['previewed', 'started', 'groups_done', 'profile_done', 'done'].map(stateRank), [0, 1, 2, 3, 4])
  assert.equal(stateRank('nope'), -1)
  assert.deepEqual(['previewed', 'started', 'groups_done', 'profile_done', 'done'].map(isInProgress), [false, true, true, true, false])
})

test('mergeDocId：同一對帳號不分先後同一個 id；不合法的 uid 拒絕', () => {
  assert.equal(mergeDocId(LINE, G_UID), mergeDocId(G_UID, LINE))
  assert.notEqual(mergeDocId(LINE, G_UID), mergeDocId(LINE, G_UID2))
  assert.throws(() => mergeDocId(LINE, ''), /invalid_uid/)
  assert.throws(() => mergeDocId(LINE, 'a/b'), /invalid_uid/)
  assert.throws(() => mergeDocId(undefined, LINE), /invalid_uid/)
})

const preview = {
  keepUid: LINE, dropUid: G_UID, groups: { bothIn: [], dropOnly: [] }, impact: { expenses: 0, settlements: 0, incomes: 0, selfTransfers: 0 },
  personal: {
    docCount: 2,
    auto: [{ path: 'settings/oaPrompt', keepUpdatedMs: 5, dropUpdatedMs: 1, suggested: 'keep' }],
    needsChoice: [{ path: 'settings/profile', keepUpdatedMs: 1, dropUpdatedMs: 5, suggested: 'drop' }],
  },
}

test('buildMergeRecord：預覽紀錄的欄位與到期時間', () => {
  const r = buildMergeRecord({ callerUid: G_UID, otherUid: LINE, preview, bind: { provider: 'line', subject: LINE }, nowMs: 1000 })
  assert.deepEqual(r.uids, [G_UID, LINE])
  assert.equal(r.initiatorUid, G_UID)
  assert.equal(r.keepUid, LINE)
  assert.equal(r.dropUid, G_UID)
  assert.equal(r.state, 'previewed')
  assert.equal(r.resolutions, null)
  assert.equal(r.backupDone, false)
  assert.equal(r.expiresAtMs, 1000 + MERGE_PREVIEW_TTL_MS)
  assert.equal(r.expireAtMs, 1000 + MERGE_PREVIEW_RECORD_TTL_MS)
  assert.deepEqual(r.bind, { provider: 'line', subject: LINE })
  assert.equal(buildMergeRecord({ callerUid: G_UID, otherUid: LINE, preview, nowMs: 1 }).bind, null)
})

test('conflictsOf：自動處理與需要決定的衝突合併成一份清單', () => {
  const r = buildMergeRecord({ callerUid: G_UID, otherUid: LINE, preview, nowMs: 0 })
  assert.deepEqual(conflictsOf(r), [
    { path: 'settings/oaPrompt', keepUpdatedMs: 5, dropUpdatedMs: 1 },
    { path: 'settings/profile', keepUpdatedMs: 1, dropUpdatedMs: 5 },
  ])
})

test('planExecute：各種現況', () => {
  const base = buildMergeRecord({ callerUid: G_UID, otherUid: LINE, preview, nowMs: 1000 })
  const now = 2000
  assert.deepEqual(planExecute(null, G_UID, now), { action: 'not_found' })
  assert.deepEqual(planExecute(base, LINE, now), { action: 'forbidden' }) // 只有發起人能執行
  assert.deepEqual(planExecute(base, G_UID, now), { action: 'run', fromState: 'previewed' })
  assert.deepEqual(planExecute(base, G_UID, base.expiresAtMs), { action: 'expired' })
  assert.deepEqual(planExecute({ ...base, state: 'done' }, G_UID, now), { action: 'done' })
  assert.deepEqual(planExecute({ ...base, state: 'done' }, LINE, now), { action: 'forbidden' })
  // 進行中且租約未過期 → busy；租約過期 → 從斷點繼續；進行中的紀錄不受預覽逾時影響
  const running = { ...base, state: 'groups_done', lease: { runId: 'r', untilMs: now + 1 } }
  assert.deepEqual(planExecute(running, G_UID, now), { action: 'busy' })
  assert.deepEqual(planExecute({ ...running, lease: { runId: 'r', untilMs: now - 1 } }, G_UID, now), { action: 'run', fromState: 'groups_done' })
  assert.deepEqual(planExecute({ ...running, lease: null }, G_UID, base.expiresAtMs + 99999), { action: 'run', fromState: 'groups_done' })
})
