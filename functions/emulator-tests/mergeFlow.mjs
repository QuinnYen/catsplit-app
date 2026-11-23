// mergeFlow.js 的 Firestore 整合測試：綁定、預覽、備份、分階段執行與斷點續跑、租約、權限、解除綁定、清除。
// 需要 Firestore 模擬器，用 npm run test:merge 執行。
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import {
  bindIdentity, previewMerge, executeMerge, unbindIdentity, purgeExpired, deleteMergeDataOf, listIdentitiesOf,
} from '../mergeFlow.js'
import { MergeError, mergeDocId, MERGE_PREVIEW_TTL_MS } from '../bind.js'
import { makeUid } from '../identity.js'
import { computeGroupAggregates } from '../../src/utils/expenseHelpers.js'

let db
before(() => {
  initializeApp({ projectId: 'demo-catsplit-mergeflow' })
  db = getFirestore()
})

const T = 'U' + '9'.repeat(32)
const NOW = 1_800_000_000_000
const ids = (s) => ({ L: `U${s.repeat(32)}`, G: `u_${s.repeat(20)}`, sub: `g${s}` })
const errorOf = async (promise) => {
  try { await promise } catch (e) { return e }
  assert.fail('expected an error')
}

const seedGroup = async (id, { members, createdBy, expenses = [], settlements = [], incomes = [] }) => {
  const ref = db.doc(`groups/${id}`)
  const toDocs = (list) => list.map((d) => ({ data: () => d }))
  await ref.set({
    name: `Group ${id}`, baseCurrency: 'TWD', createdBy, members,
    memberProfiles: Object.fromEntries(members.map((m) => [m, { name: `N-${m.slice(0, 4)}` }])),
    ...computeGroupAggregates(members, toDocs(expenses), toDocs(settlements), toDocs(incomes)),
  })
  for (const [col, list] of [['expenses', expenses], ['settlements', settlements], ['incomes', incomes]]) {
    for (const [i, d] of list.entries()) await ref.collection(col).doc(`${col[0]}${i + 1}`).set(d)
  }
}

/**
 * 一組測試帳號：
 *  L：舊 LINE 使用者（uid 就是 LINE userId，沒有對照項），在 gL1、gL2、gBoth（3 個群組）
 *  G：Google 帳號（內部 uid，有 Google 對照項），在 gG1、gBoth（2 個群組）→ 合併時 L 保留、G 被併入
 */
const seed = async (s) => {
  const { L, G, sub } = ids(s)
  await db.doc(`users/${L}`).set({ name: 'L' })
  await db.doc(`users/${G}`).set({ name: 'G', provider: 'google' })
  await db.doc(`identities/google:${sub}`).set({ uid: G, provider: 'google', subject: sub })
  await seedGroup(`gL1${s}`, { members: [L, T], createdBy: L })
  await seedGroup(`gL2${s}`, { members: [L, T], createdBy: T })
  await seedGroup(`gG1${s}`, { members: [G, T], createdBy: G, expenses: [{ amount: 8, payments: { [G]: 8 }, splits: { [G]: 4, [T]: 4 }, createdBy: G }] })
  await seedGroup(`gBoth${s}`, {
    members: [L, G, T], createdBy: G,
    expenses: [
      { amount: 90, payments: { [G]: 90 }, splits: { [L]: 30, [G]: 30, [T]: 30 }, createdBy: G },
      { amount: 60, payments: { [L]: 40, [T]: 20 }, splits: { [L]: 20, [G]: 20, [T]: 20 }, createdBy: L },
    ],
    settlements: [
      { from: L, to: G, amount: 20, settledBy: L },
      { from: G, to: T, amount: 10, settledBy: G },
    ],
  })
  const u = (uid, path) => db.doc(`users/${uid}/${path}`)
  await u(L, 'paymentMethods/pmL').set({ providerId: 'bank', value: '111' })
  await u(L, 'settings/profile').set({ nickname: 'LNick' })
  await u(G, 'paymentMethods/pmG').set({ providerId: 'line', value: '222' })
  await u(G, 'savingsGoals/sg1').set({ title: 'trip' })
  await u(G, 'savingsGoals/sg1/entries/en1').set({ type: 'save', amount: 5 })
  await new Promise((r) => setTimeout(r, 15))
  await u(G, 'settings/profile').set({ nickname: 'GNick' })
  return { L, G, sub, u }
}

const makeDeps = (extra = {}) => {
  const deleted = []
  return { deleted, deleteAuthUser: async (uid) => { deleted.push(uid) }, createToken: async (uid) => `token:${uid}`, ...extra }
}

// ---------- 綁定 ----------

test('bindIdentity：沒有對照項就新增一筆指向呼叫者，再綁一次是 already_bound', async () => {
  const { G } = ids('a')
  const r = await bindIdentity(db, { callerUid: G, provider: 'google', subject: 'new-sub-a', nowMs: NOW })
  assert.deepEqual(r, { status: 'bound' })
  assert.equal((await db.doc('identities/google:new-sub-a').get()).data().uid, G)
  assert.deepEqual(await bindIdentity(db, { callerUid: G, provider: 'google', subject: 'new-sub-a', nowMs: NOW }), { status: 'already_bound' })
})

test('bindIdentity：舊 LINE 使用者綁自己的 LINE（對照項還沒懶建立）會補建，不是合併', async () => {
  const { L } = await seed('b')
  const r = await bindIdentity(db, { callerUid: L, provider: 'line', subject: L, nowMs: NOW })
  assert.deepEqual(r, { status: 'already_bound' })
  assert.equal((await db.doc(`identities/line:${L}`).get()).data().uid, L)
})

test('bindIdentity：Google 帳號綁一個沒有對照項、但已是現有帳號的 LINE → 要求合併，預覽不改任何資料', async () => {
  const { L, G } = await seed('c')
  const gBefore = (await db.doc('groups/gBothc').get()).data()
  const r = await bindIdentity(db, { callerUid: G, provider: 'line', subject: L, nowMs: NOW })
  assert.equal(r.status, 'merge_required')
  assert.equal(r.mergeId, mergeDocId(L, G))
  assert.equal(r.initiatorIsDropped, true) // L 有 3 個群組、G 有 2 個，保留 L、被併入 G，發起人 G 會被刪
  assert.deepEqual(r.groups.bothIn.map((g) => g.id), ['gBothc'])
  assert.deepEqual(r.groups.dropOnly.map((g) => g.id), ['gG1c'])
  assert.equal(r.expiresAtMs, NOW + MERGE_PREVIEW_TTL_MS)
  assert.deepEqual(r.personal.needsChoice.map((c) => c.path), ['settings/profile'])
  assert.equal(r.personal.needsChoice[0].suggested, 'drop') // G 的暱稱較新

  const rec = (await db.doc(`merges/${r.mergeId}`).get()).data()
  assert.equal(rec.state, 'previewed')
  assert.equal(rec.initiatorUid, G)
  assert.deepEqual(rec.bind, { provider: 'line', subject: L }) // 合併完成時補建 LINE 對照項
  assert.deepEqual((await db.doc('groups/gBothc').get()).data(), gBefore)
  assert.equal((await db.doc(`identities/line:${L}`).get()).exists, false)
})

test('bindIdentity：對照表已有、屬於另一個帳號 → 合併，不需要補建對照項', async () => {
  const { L, G } = await seed('d')
  await db.doc(`identities/line:${L}`).set({ uid: L, provider: 'line', subject: L })
  const r = await bindIdentity(db, { callerUid: G, provider: 'line', subject: L, nowMs: NOW })
  assert.equal(r.status, 'merge_required')
  assert.equal((await db.doc(`merges/${r.mergeId}`).get()).data().bind, null)
})

test('previewMerge：訪客與相同帳號不能合併；重新預覽會蓋掉舊的預覽', async () => {
  const { L, G } = await seed('e')
  assert.equal((await errorOf(previewMerge(db, { callerUid: G, otherUid: 'p_abc', nowMs: NOW }))).code, 'guest_not_mergeable')
  assert.equal((await errorOf(previewMerge(db, { callerUid: G, otherUid: G, nowMs: NOW }))).code, 'same_uid')
  const first = await previewMerge(db, { callerUid: G, otherUid: L, nowMs: NOW })
  const second = await previewMerge(db, { callerUid: L, otherUid: G, nowMs: NOW + 1000 }) // 換成 L 發起
  assert.equal(second.mergeId, first.mergeId)
  assert.equal(second.initiatorIsDropped, false)
  assert.equal((await db.doc(`merges/${first.mergeId}`).get()).data().initiatorUid, L)
})

// ---------- 執行 ----------

const doPreview = async (s, extra = {}) => {
  const acc = await seed(s)
  const p = await bindIdentity(db, { callerUid: acc.G, provider: 'line', subject: acc.L, nowMs: NOW, ...extra })
  return { ...acc, mergeId: p.mergeId, preview: p }
}

test('executeMerge：完整合併（群組、個人資料、對照表、Auth、備份、換 token）', async () => {
  const { L, G, sub, u, mergeId } = await doPreview('f')
  const deps = makeDeps()
  const r = await executeMerge(db, deps, { mergeId, callerUid: G, userChoices: { 'settings/profile': 'drop' }, runId: 'r1' })
  assert.deepEqual([r.keepUid, r.dropUid, r.alreadyDone], [L, G, false])
  assert.equal(r.firebaseToken, `token:${L}`) // 發起人 G 被刪，用保留帳號的 token 重新登入
  assert.deepEqual(deps.deleted, [G])

  const rec = (await db.doc(`merges/${mergeId}`).get()).data()
  assert.equal(rec.state, 'done')
  assert.equal(rec.lease, null)
  assert.equal(rec.backupDone, true)
  assert.deepEqual(rec.resolutions, { 'settings/profile': 'drop' })
  assert.ok(rec.expireAtMs > rec.finishedAtMs)

  // 群組
  const both = (await db.doc('groups/gBothf').get()).data()
  assert.deepEqual([...both.members].sort(), [L, T].sort())
  assert.equal(both.createdBy, L)
  assert.ok(!(G in both.memberBalances))
  assert.deepEqual((await db.doc('groups/gG1f').get()).data().members, [L, T])
  assert.equal((await db.doc('groups/gBothf/settlements/s1').get()).exists, false) // L→G 變成自己轉給自己，已刪除
  assert.equal((await db.doc('groups/gBothf/settlements/s2').get()).data().from, L)
  assert.deepEqual((await db.doc('groups/gL1f').get()).data().members, [L, T]) // 沒動

  // 個人資料
  assert.equal((await u(L, 'paymentMethods/pmL').get()).data().value, '111')
  assert.equal((await u(L, 'paymentMethods/pmG').get()).data().value, '222')
  assert.equal((await u(L, 'savingsGoals/sg1/entries/en1').get()).data().amount, 5)
  assert.equal((await u(L, 'settings/profile').get()).data().nickname, 'GNick') // 使用者選 drop
  assert.deepEqual(await db.doc(`users/${G}`).listCollections(), [])
  assert.equal((await db.doc(`users/${G}`).get()).exists, false)

  // 對照表：Google 改指向 L，並補建 LINE 對照項
  assert.equal((await db.doc(`identities/google:${sub}`).get()).data().uid, L)
  assert.equal((await db.doc(`identities/line:${L}`).get()).data().uid, L)
  assert.deepEqual((await listIdentitiesOf(db, G)), [])
  assert.deepEqual((await listIdentitiesOf(db, L)).map((i) => i.id).sort(), [`google:${sub}`, `line:${L}`].sort())

  // 備份：改動前的內容
  const bak = (await db.doc(`mergeBackups/${mergeId}`).get()).data()
  assert.equal(bak.dropUid, G)
  assert.deepEqual(bak.dropIdentities, [{ id: `google:${sub}`, uid: G }])
  assert.equal(bak.dropUserDoc.provider, 'google')
  assert.ok(bak.expireAtMs > bak.createdAtMs)
  const groupDocs = Object.fromEntries((await db.collection(`mergeBackups/${mergeId}/groupDocs`).get()).docs.map((d) => [d.data().col ? `${d.data().groupId}/${d.data().col}/${d.data().docId}` : d.data().groupId, d.data()]))
  assert.ok(groupDocs.gBothf.data.members.includes(G), '備份的是搬移前的群組文件')
  assert.equal(groupDocs['gBothf/settlements/s1'].data.from, L, '會被刪除的自付轉帳也有備份')
  assert.ok(groupDocs.gG1f && groupDocs['gG1f/expenses/e1'])
  const personal = (await db.collection(`mergeBackups/${mergeId}/personal`).get()).docs.map((d) => d.data().path).sort()
  assert.deepEqual(personal, ['paymentMethods/pmG', 'savingsGoals/sg1', 'savingsGoals/sg1/entries/en1', 'settings/profile'])
  const overwritten = (await db.collection(`mergeBackups/${mergeId}/keepOverwritten`).get()).docs.map((d) => d.data())
  assert.deepEqual(overwritten.map((o) => [o.path, o.data.nickname]), [['settings/profile', 'LNick']]) // 被覆蓋的 L 的暱稱

  // 重複執行：直接回結果，不再動任何東西
  const again = await executeMerge(db, deps, { mergeId, callerUid: G, runId: 'r2' })
  assert.equal(again.alreadyDone, true)
  assert.equal(again.firebaseToken, `token:${L}`)
  assert.deepEqual(deps.deleted, [G])
})

test('executeMerge：使用者選保留自己的暱稱，不覆蓋，備份也不存 keepOverwritten', async () => {
  const { L, G, u, mergeId } = await doPreview('g')
  await executeMerge(db, makeDeps(), { mergeId, callerUid: G, userChoices: { 'settings/profile': 'keep' }, runId: 'r' })
  assert.equal((await u(L, 'settings/profile').get()).data().nickname, 'LNick')
  assert.equal((await db.collection(`mergeBackups/${mergeId}/keepOverwritten`).get()).size, 0)
})

test('executeMerge：沒指定選擇就用預設建議（較新的）', async () => {
  const { L, G, u, mergeId } = await doPreview('h')
  await executeMerge(db, makeDeps(), { mergeId, callerUid: G, runId: 'r' })
  assert.equal((await u(L, 'settings/profile').get()).data().nickname, 'GNick')
})

test('executeMerge：發起人是保留的那一邊時，被刪除的是另一個帳號', async () => {
  const { L, G, mergeId } = await (async () => {
    const acc = await seed('i')
    const p = await bindIdentity(db, { callerUid: acc.L, provider: 'google', subject: acc.sub, nowMs: NOW })
    return { ...acc, mergeId: p.mergeId, p }
  })()
  const deps = makeDeps()
  const r = await executeMerge(db, deps, { mergeId, callerUid: L, runId: 'r' })
  assert.deepEqual([r.keepUid, r.dropUid], [L, G])
  assert.deepEqual(deps.deleted, [G])
})

// ---------- 斷點續跑 ----------

test('executeMerge：每個階段失敗後都能重試，備份不會重做（否則會備份到搬移後的資料）', async () => {
  for (const [s, stage, stateAfterFail] of [['j', 'backup_done', 'started'], ['k', 'groups_done', 'groups_done'], ['l', 'profile_done', 'profile_done']]) {
    const { L, G, mergeId } = await doPreview(s)
    let failed = false
    const deps = makeDeps({ hook: async (st) => { if (st === stage && !failed) { failed = true; throw new Error(`boom-${stage}`) } } })
    const e = await errorOf(executeMerge(db, deps, { mergeId, callerUid: G, runId: 'r1' }))
    assert.equal(e.message, `boom-${stage}`)
    const mid = (await db.doc(`merges/${mergeId}`).get()).data()
    assert.equal(mid.state, stateAfterFail, stage)
    assert.equal(mid.lease, null, '失敗後釋放租約，可以立刻重試')
    assert.deepEqual(deps.deleted, [])
    const bakBefore = (await db.doc(`mergeBackups/${mergeId}`).get()).data()
    assert.ok(bakBefore.counts.groupDocs > 0 && bakBefore.counts.personal > 0, `${stage}：第一次的備份應該有內容`)

    const r = await executeMerge(db, deps, { mergeId, callerUid: G, runId: 'r2' })
    assert.deepEqual([r.keepUid, r.dropUid], [L, G], stage)
    assert.equal((await db.doc(`merges/${mergeId}`).get()).data().state, 'done')
    assert.deepEqual(deps.deleted, [G])
    const bakBoth = (await db.doc(`mergeBackups/${mergeId}/groupDocs/${encodeURIComponent(`gBoth${s}`)}`).get()).data()
    assert.ok(bakBoth.data.members.includes(G), `${stage}：備份應該是搬移前的內容`)
    // 重試不能重做備份：重做會在搬移後掃到空的，把 meta 的筆數洗成 0
    assert.deepEqual((await db.doc(`mergeBackups/${mergeId}`).get()).data(), bakBefore, `${stage}：備份 meta 不應被改動`)
    assert.ok((await db.doc(`groups/gBoth${s}`).get()).data().members.every((m) => m !== G))
  }
})

test('executeMerge：重試時使用第一次存下的解決方案，不受之後傳入的選擇影響', async () => {
  const { L, G, u, mergeId } = await doPreview('m')
  let failed = false
  const deps = makeDeps({ hook: async (st) => { if (st === 'groups_done' && !failed) { failed = true; throw new Error('boom') } } })
  await errorOf(executeMerge(db, deps, { mergeId, callerUid: G, userChoices: { 'settings/profile': 'keep' }, runId: 'r1' }))
  await executeMerge(db, deps, { mergeId, callerUid: G, userChoices: { 'settings/profile': 'drop' }, runId: 'r2' })
  assert.equal((await u(L, 'settings/profile').get()).data().nickname, 'LNick')
})

// ---------- 租約、權限、逾時、不合法的選擇 ----------

test('executeMerge：上一次還在執行（租約未過期）回 409，過期後可繼續', async () => {
  const { G, mergeId } = await doPreview('n')
  await db.doc(`merges/${mergeId}`).update({ state: 'started', lease: { runId: 'other', untilMs: Date.now() + 60_000 }, resolutions: {} })
  const e = await errorOf(executeMerge(db, makeDeps(), { mergeId, callerUid: G, runId: 'r' }))
  assert.deepEqual([e.code, e.status], ['merge_running', 409])
  await db.doc(`merges/${mergeId}`).update({ lease: { runId: 'other', untilMs: Date.now() - 1 } })
  const r = await executeMerge(db, makeDeps(), { mergeId, callerUid: G, runId: 'r2' })
  assert.equal(r.alreadyDone, false)
})

test('executeMerge：只有發起人能執行，找不到、預覽逾時、不合法的選擇都拒絕且不改狀態', async () => {
  const { L, G, mergeId } = await doPreview('o')
  const run = (over) => executeMerge(db, makeDeps(over.deps), { mergeId, callerUid: G, runId: 'r', ...over })
  assert.deepEqual([(await errorOf(run({ callerUid: L }))).code, (await errorOf(run({ callerUid: L }))).status], ['forbidden', 403])
  assert.equal((await errorOf(run({ mergeId: 'nope' }))).code, 'merge_not_found')
  assert.equal((await errorOf(run({ userChoices: { 'settings/nope': 'keep' } }))).code, 'unknown_conflict_path')
  assert.equal((await errorOf(run({ userChoices: { 'settings/profile': 'both' } }))).code, 'invalid_resolution')
  // 預覽逾時（時間由 deps.nowMs 注入）
  const late = await errorOf(run({ deps: { nowMs: () => NOW + MERGE_PREVIEW_TTL_MS + 1 } }))
  assert.deepEqual([late.code, late.status], ['preview_expired', 410])
  assert.equal((await db.doc(`merges/${mergeId}`).get()).data().state, 'previewed')
  assert.equal((await db.doc(`groups/gBotho`).get()).data().members.includes(G), true) // 什麼都沒動
})

test('previewMerge：任一帳號有進行中的其他合併，或這一對已在執行時拒絕', async () => {
  const { L, G, mergeId } = await doPreview('p')
  await db.doc(`merges/${mergeId}`).update({ state: 'groups_done' })
  const same = await errorOf(previewMerge(db, { callerUid: G, otherUid: L, nowMs: NOW }))
  assert.deepEqual([same.code, same.status], ['merge_in_progress', 409])
  const other = await errorOf(previewMerge(db, { callerUid: G, otherUid: T, nowMs: NOW }))
  assert.deepEqual([other.code, other.status, other.extra.mergeId], ['other_merge_in_progress', 409, mergeId])
})

// ---------- 解除綁定 ----------

test('unbindIdentity：一般情況刪除，最後一個不能刪，不是自己的找不到', async () => {
  const { G, sub } = ids('q')
  await db.doc(`identities/google:${sub}`).set({ uid: G, provider: 'google', subject: sub })
  await db.doc(`identities/line:Uq${'0'.repeat(31)}`).set({ uid: G, provider: 'line', subject: `Uq${'0'.repeat(31)}` })
  assert.deepEqual(await unbindIdentity(db, { callerUid: G, identityId: `google:${sub}`, makeUid, nowMs: NOW }), { mode: 'delete' })
  assert.equal((await db.doc(`identities/google:${sub}`).get()).exists, false)
  const last = await errorOf(unbindIdentity(db, { callerUid: G, identityId: `line:Uq${'0'.repeat(31)}`, makeUid, nowMs: NOW }))
  assert.deepEqual([last.code, last.status], ['last_identity', 409])
  const nf = await errorOf(unbindIdentity(db, { callerUid: 'u_other', identityId: `line:Uq${'0'.repeat(31)}`, makeUid, nowMs: NOW }))
  assert.equal(nf.code, 'identity_not_found')
})

test('unbindIdentity：舊 LINE 使用者自己的 LINE 改指向新的空帳號，LINE 之後登入的不再是這個帳號', async () => {
  const { L, sub } = ids('r')
  await db.doc(`identities/line:${L}`).set({ uid: L, provider: 'line', subject: L })
  await db.doc(`identities/google:${sub}`).set({ uid: L, provider: 'google', subject: sub })
  assert.deepEqual(await unbindIdentity(db, { callerUid: L, identityId: `line:${L}`, makeUid, nowMs: NOW }), { mode: 'repoint' })
  const after = (await db.doc(`identities/line:${L}`).get()).data()
  assert.match(after.uid, /^u_[0-9a-f]{20}$/)
  assert.equal(after.unboundFrom, L)
  assert.deepEqual((await listIdentitiesOf(db, L)).map((i) => i.id), [`google:${sub}`])
  // 之後 LINE 再綁回來，會被視為另一個帳號而要求合併
  const again = await bindIdentity(db, { callerUid: L, provider: 'line', subject: L, nowMs: NOW })
  assert.equal(again.status, 'merge_required')
})

// ---------- 清除 ----------

test('purgeExpired：只刪過期的，進行中（expireAtMs 為 null）的不會被刪，子集合一併刪除', async () => {
  await db.doc('merges/old.done').set({ state: 'done', uids: ['a', 'b'], expireAtMs: 1000 })
  await db.doc('merges/running.one').set({ state: 'started', uids: ['a', 'b'], expireAtMs: null })
  await db.doc('merges/fresh.one').set({ state: 'done', uids: ['a', 'b'], expireAtMs: NOW + 1000 })
  await db.doc('mergeBackups/old.done').set({ uids: ['a', 'b'], expireAtMs: 1000 })
  await db.doc('mergeBackups/old.done/personal/x').set({ path: 'x', data: {} })
  await db.doc('mergeBackups/fresh.one').set({ uids: ['a', 'b'], expireAtMs: NOW + 1000 })
  const deleted = await purgeExpired(db, NOW)
  assert.ok(deleted.includes('merges/old.done') && deleted.includes('mergeBackups/old.done'))
  assert.ok(!deleted.includes('merges/running.one') && !deleted.includes('merges/fresh.one') && !deleted.includes('mergeBackups/fresh.one'))
  assert.equal((await db.doc('merges/old.done').get()).exists, false)
  assert.equal((await db.doc('mergeBackups/old.done/personal/x').get()).exists, false)
  assert.equal((await db.doc('merges/running.one').get()).exists, true)
})

test('deleteMergeDataOf：刪除帳號時，牽涉到這個 uid 的合併紀錄與備份（含子集合）一併刪除', async () => {
  const { L, G, mergeId } = await doPreview('s')
  await executeMerge(db, makeDeps(), { mergeId, callerUid: G, runId: 'r' })
  assert.equal((await db.doc(`mergeBackups/${mergeId}`).get()).exists, true)
  await deleteMergeDataOf(db, L) // 保留帳號刪除帳號，被併入帳號的備份也要一起刪
  assert.equal((await db.doc(`merges/${mergeId}`).get()).exists, false)
  assert.equal((await db.doc(`mergeBackups/${mergeId}`).get()).exists, false)
  assert.equal((await db.collection(`mergeBackups/${mergeId}/personal`).get()).size, 0)
})

test('MergeError 帶有 code 與 status', () => {
  const e = new MergeError('x', 409, { a: 1 })
  assert.deepEqual([e.code, e.status, e.extra, e.message], ['x', 409, { a: 1 }, 'x'])
})
