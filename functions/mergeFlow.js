// 綁定與帳號合併的流程（Firestore 操作，db 與 Auth 相關函式由呼叫端傳入，所以不 import firebase-admin，可在模擬器直接測）。
// 純判斷在 bind.js、merge.js；群組與個人資料的實際搬移在 memberOps.js。設計見 docs/superpowers/specs/2026-11-14-p14-identity-design.md。
import {
  MergeError, MERGE_LEASE_MS, MERGE_DONE_TTL_MS,
  decideBind, planUnbind, planExecute, buildMergeRecord, mergeDocId, isInProgress, stateRank, conflictsOf,
} from './bind.js'
import { assertMergeable, buildResolutions } from './merge.js'
import { buildMergePreview, migrateAllGroups, movePersonalData, readPersonalTree } from './memberOps.js'
import { identityKey } from './identity.js'
import { mergeProfiles } from './profile.js'
import { MIGRATION_FIELDS, migrationPatch } from './migrate.js'

const ALREADY_EXISTS = 6
const enc = (s) => encodeURIComponent(s)

// ---------- 對照表 ----------

const getIdentity = async (db, provider, subject) => {
  const snap = await db.doc(`identities/${identityKey(provider, subject)}`).get()
  return snap.exists ? { id: snap.id, ...snap.data() } : null
}

// 沒有才建立；回傳是否由這次呼叫建立（已存在代表剛好被別人先建立）
const createIdentityIfAbsent = async (db, provider, subject, uid, nowMs) => {
  try {
    await db.doc(`identities/${identityKey(provider, subject)}`).create({ uid, provider, subject, createdAt: new Date(nowMs) })
    return true
  } catch (e) {
    if (e.code === ALREADY_EXISTS) return false
    throw e
  }
}

// 呼叫者自己的所有對照項
export const listIdentitiesOf = async (db, uid) => {
  const snap = await db.collection('identities').where('uid', '==', uid).get()
  return snap.docs.map((d) => {
    const x = d.data()
    return { id: d.id, uid: x.uid, provider: x.provider, subject: x.subject, createdAtMs: x.createdAt?.toMillis?.() ?? null }
  })
}

// ---------- 預覽 ----------

const findInProgressMerges = async (db, uids, exceptId) => {
  const ids = new Set()
  for (const uid of uids) {
    const snap = await db.collection('merges').where('uids', 'array-contains', uid).get()
    snap.docs.forEach((d) => { if (d.id !== exceptId && isInProgress(d.data().state)) ids.add(d.id) })
  }
  return [...ids]
}

// 給前端看的預覽內容（不含內部 uid 以外的紀錄細節）
const publicPreview = (mergeId, record) => ({
  mergeId,
  initiatorIsDropped: record.dropUid === record.initiatorUid,
  groups: record.preview.groups,
  impact: record.preview.impact,
  personal: record.preview.personal,
  expiresAtMs: record.expiresAtMs,
})

/**
 * 兩個帳號都有資料時，建立合併預覽（dry-run，不改任何資料）並存成 merges/{id}（狀態 previewed）。
 * 同一對帳號固定同一份紀錄；任一帳號有進行中的其他合併、或這一對已在執行，會拒絕（409）。
 */
export const previewMerge = async (db, { callerUid, otherUid, nowMs }) => {
  try {
    assertMergeable(callerUid, otherUid)
  } catch (e) {
    throw new MergeError(e.message, 400)
  }
  const mergeId = mergeDocId(callerUid, otherUid)
  const busy = await findInProgressMerges(db, [callerUid, otherUid], mergeId)
  if (busy.length > 0) throw new MergeError('other_merge_in_progress', 409, { mergeId: busy[0] })
  const ref = db.doc(`merges/${mergeId}`)
  const existing = await ref.get()
  if (existing.exists && isInProgress(existing.data().state)) throw new MergeError('merge_in_progress', 409, { mergeId })

  const preview = await buildMergePreview(db, callerUid, otherUid)
  const record = buildMergeRecord({ callerUid, otherUid, preview, nowMs })
  await ref.set(record)
  return publicPreview(mergeId, record)
}

/**
 * 綁定第二種身分（呼叫端已驗證憑證，subject 是驗證後的身分）。回傳：
 *  { status: 'bound' }（新增一筆對照項）、{ status: 'already_bound' }、
 *  { status: 'merge_required', ...預覽 }（對方是另一個有資料的帳號，要合併）
 */
export const bindIdentity = async (db, { callerUid, provider, subject, nowMs }) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const identity = await getIdentity(db, provider, subject)
    const d = decideBind({ callerUid, identity })
    if (d.action === 'already_bound') return { status: 'already_bound' }
    if (d.action === 'create') {
      if (await createIdentityIfAbsent(db, provider, subject, callerUid, nowMs)) return { status: 'bound' }
      continue // 剛好被別人先建立，重新判斷
    }
    return { status: 'merge_required', ...(await previewMerge(db, { callerUid, otherUid: d.otherUid, nowMs })) }
  }
  throw new MergeError('conflict_retry', 409)
}

// ---------- 備份 ----------

/**
 * 在動任何資料之前，把「被併入帳號」會被改動或刪除的資料備份到 mergeBackups/{mergeId}（保留 30 天，還原靠腳本）：
 * - groupDocs：被併入帳號所在的每個群組文件，以及會被改動的支出、轉帳（含會被刪除的自付轉帳）、收入文件改動前的內容
 * - personal：被併入帳號 users/{uid} 底下所有文件
 * - keepOverwritten：解決方案選「用被併入帳號的」而被覆蓋的保留帳號文件
 * meta 文件最後才寫，有 meta 才代表備份完整；重試時 backupDone 為 false 才會重做（此時一定還沒開始搬移）。
 */
const backupBeforeMerge = async (db, mergeId, merge, nowMs) => {
  const { keepUid, dropUid, resolutions = {} } = merge
  const bref = db.doc(`mergeBackups/${mergeId}`)
  const writer = db.bulkWriter()
  const counts = { groupDocs: 0, personal: 0, keepOverwritten: 0 }

  const groups = await db.collection('groups').where('members', 'array-contains', dropUid).get()
  for (const g of groups.docs) {
    writer.set(bref.collection('groupDocs').doc(enc(g.id)), { groupId: g.id, col: null, docId: g.id, data: g.data() })
    counts.groupDocs += 1
    for (const col of ['expenses', 'settlements', 'incomes']) {
      for (const d of (await g.ref.collection(col).get()).docs) {
        if (!migrationPatch(d.data(), MIGRATION_FIELDS[col], dropUid, keepUid)) continue
        writer.set(bref.collection('groupDocs').doc(enc(`${g.id}/${col}/${d.id}`)), { groupId: g.id, col, docId: d.id, data: d.data() })
        counts.groupDocs += 1
      }
    }
  }

  for (const { path, data } of await readPersonalTree(db, dropUid)) {
    writer.set(bref.collection('personal').doc(enc(path)), { path, data })
    counts.personal += 1
  }
  for (const [path, choice] of Object.entries(resolutions)) {
    if (choice !== 'drop') continue
    const snap = await db.doc(`users/${keepUid}/${path}`).get()
    if (!snap.exists) continue
    writer.set(bref.collection('keepOverwritten').doc(enc(path)), { path, data: snap.data() })
    counts.keepOverwritten += 1
  }
  await writer.close()

  const dropUserDoc = await db.doc(`users/${dropUid}`).get()
  await bref.set({
    mergeId, uids: merge.uids, keepUid, dropUid, createdAtMs: nowMs, expireAtMs: nowMs + MERGE_DONE_TTL_MS, counts,
    dropIdentities: (await listIdentitiesOf(db, dropUid)).map(({ id, uid }) => ({ id, uid })),
    dropUserDoc: dropUserDoc.exists ? dropUserDoc.data() : null,
  })
}

// ---------- 收尾 ----------

// 被併入帳號的對照項全部改指向保留帳號，再刪 users/{drop} 與 Auth。每一步都可重複執行
const finalizeMerge = async (db, deps, merge) => {
  const { keepUid, dropUid } = merge
  const snap = await db.collection('identities').where('uid', '==', dropUid).get()
  for (const d of snap.docs) await d.ref.update({ uid: keepUid, mergedFrom: dropUid })
  // 兩邊各登入方式的名稱與頭像取聯集寫回保留帳號，被併入帳號的 users 文件刪掉後才不會遺失（見 profile.js）
  const [keepDoc, dropDoc] = await Promise.all([db.doc(`users/${keepUid}`).get(), db.doc(`users/${dropUid}`).get()])
  if (dropDoc.exists) {
    await db.doc(`users/${keepUid}`).set(mergeProfiles(keepDoc.exists ? keepDoc.data() : null, dropDoc.data()), { merge: true })
  }
  await db.doc(`users/${dropUid}`).delete()
  await deps.deleteAuthUser(dropUid)
}

/**
 * 執行合併。分階段、可從斷點重試：previewed → started → groups_done → profile_done → done，進度存在 merges/{id}。
 * - 只有發起人能執行；預覽 10 分鐘內要確認；用租約避免同時執行兩次（上一次還在跑回 409）
 * - 第一次執行時用預覽的衝突清單加上使用者的選擇定出完整解決方案並存起來，之後重試一律用同一份
 * - 動資料之前先備份（見 backupBeforeMerge）
 * deps：{ deleteAuthUser(uid), createToken(uid), nowMs?(), hook?(stage) }；hook 只給測試注入失敗用
 * 回傳 { keepUid, dropUid, firebaseToken, alreadyDone }；firebaseToken 是保留帳號的 custom token（被刪的那個帳號的 session 會失效，要靠它重新登入）
 */
export const executeMerge = async (db, deps, { mergeId, callerUid, userChoices, runId }) => {
  const now = () => (deps.nowMs ? deps.nowMs() : Date.now())
  const ref = db.doc(`merges/${mergeId}`)
  const startMs = now()

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const merge = snap.exists ? snap.data() : null
    const plan = planExecute(merge, callerUid, startMs)
    if (plan.action !== 'run') return { plan, merge }
    const patch = { lease: { runId, untilMs: startMs + MERGE_LEASE_MS } }
    if (merge.state === 'previewed') {
      let resolutions
      try {
        resolutions = buildResolutions(conflictsOf(merge), userChoices ?? {})
      } catch (e) {
        throw new MergeError(String(e.message).split(':')[0], 400)
      }
      Object.assign(patch, { state: 'started', resolutions, startedAtMs: startMs, expireAtMs: null })
    }
    tx.update(ref, patch)
    return { plan, merge: { ...merge, ...patch } }
  })

  const errors = { not_found: ['merge_not_found', 404], forbidden: ['forbidden', 403], expired: ['preview_expired', 410], busy: ['merge_running', 409] }
  if (errors[claimed.plan.action]) throw new MergeError(...errors[claimed.plan.action])
  if (claimed.plan.action === 'done') {
    const { keepUid, dropUid } = claimed.merge
    return { keepUid, dropUid, firebaseToken: await deps.createToken(keepUid), alreadyDone: true }
  }

  const m = claimed.merge
  const { keepUid, dropUid } = m
  try {
    await deps.hook?.('start')
    if (!m.backupDone) {
      await backupBeforeMerge(db, mergeId, m, now())
      await ref.update({ backupDone: true })
    }
    await deps.hook?.('backup_done')

    let state = m.state
    if (stateRank(state) < stateRank('groups_done')) {
      const result = await migrateAllGroups(db, keepUid, dropUid)
      if (result.failed.length > 0) {
        await ref.update({ failedGroups: result.failed })
        throw new MergeError('groups_failed', 500, { failed: result.failed })
      }
      await ref.update({ state: 'groups_done', failedGroups: [] })
      state = 'groups_done'
    }
    await deps.hook?.('groups_done')

    if (stateRank(state) < stateRank('profile_done')) {
      await movePersonalData(db, keepUid, dropUid, m.resolutions ?? {})
      await ref.update({ state: 'profile_done' })
    }
    await deps.hook?.('profile_done')

    await finalizeMerge(db, deps, m)
    const doneMs = now()
    await ref.update({ state: 'done', finishedAtMs: doneMs, expireAtMs: doneMs + MERGE_DONE_TTL_MS, lease: null })
  } catch (e) {
    await ref.update({ lease: null, error: e.code ?? e.message ?? 'unknown' }).catch(() => {})
    throw e
  }
  return { keepUid, dropUid, firebaseToken: await deps.createToken(keepUid), alreadyDone: false }
}

// ---------- 解除綁定 ----------

/**
 * 解除一個登入方式（identityId 是對照項的文件 id，例如 google:1122）。至少要保留一種；解除就是刪掉那個對照項。
 */
export const unbindIdentity = async (db, { callerUid, identityId }) => {
  const mine = await listIdentitiesOf(db, callerUid)
  const plan = planUnbind({ callerUid, identities: mine, targetId: identityId })
  if (!plan.ok) throw new MergeError(plan.error, plan.error === 'last_identity' ? 409 : 404)
  const ref = db.doc(`identities/${identityId}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists || snap.data().uid !== callerUid) throw new MergeError('identity_not_found', 404)
    tx.delete(ref)
  })
}

// ---------- 清除 ----------

/**
 * 刪掉過期的合併紀錄、備份與一次性連結碼（expireAtMs 小於現在）：沒人確認的預覽一天後、完成的合併與備份 30 天後、連結碼過期一小時後。
 * 進行中的合併 expireAtMs 為 null，不會被刪。每次最多處理 limit 筆，回傳刪掉的路徑。
 */
export const purgeExpired = async (db, nowMs, limit = 20) => {
  const deleted = []
  for (const col of ['merges', 'mergeBackups', 'linkCodes']) {
    const snap = await db.collection(col).where('expireAtMs', '<', nowMs).limit(limit).get()
    for (const d of snap.docs) {
      await db.recursiveDelete(d.ref)
      deleted.push(`${col}/${d.id}`)
    }
  }
  return deleted
}

// 刪除帳號時，一併刪掉牽涉到這個 uid 的合併紀錄與備份（備份裡有另一個帳號的資料）
export const deleteMergeDataOf = async (db, uid) => {
  for (const col of ['merges', 'mergeBackups']) {
    const snap = await db.collection(col).where('uids', 'array-contains', uid).get()
    for (const d of snap.docs) await db.recursiveDelete(d.ref)
  }
}
