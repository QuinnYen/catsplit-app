// 成員搬移與帳號合併的 Firestore 操作。Firestore 實例（Admin SDK）由呼叫端傳入，所以這個檔案不 import firebase-admin，
// 可以在模擬器測試裡直接載入（見 functions/emulator-tests/）。純判斷邏輯在 merge.js 與 migrate.js。
import { moveKey, swapId, MIGRATION_FIELDS, migrationPatch } from './migrate.js'
import {
  assertMergeable, chooseKeepUid, classifyGroups, classifyPersonalConflicts,
  countMigrationImpact, isSelfTransferAfterMove,
} from './merge.js'

const ALREADY_EXISTS = 6

/**
 * 把群組內所有 fromId 的紀錄改成 toUid。先改子集合、最後才改群組文件，
 * 中途失敗時 fromId 仍留在 members，重試即可繼續（已改過的文件不會再被動到）。
 * toUid 已經是成員時，金額、餘額、筆數相加合併；改完之後變成「自己轉給自己」的轉帳會被刪除
 * （轉帳對餘額是對沖，自己轉給自己淨效果為 0，刪除不影響任何餘額）。
 * 回傳 false 代表沒有事情要做（群組不存在，或 fromId 已不在成員裡）。
 */
export const migrateMember = async (db, groupId, fromId, toUid, profileOverride = {}) => {
  const groupRef = db.doc(`groups/${groupId}`)
  const groupSnap = await groupRef.get()
  if (!groupSnap.exists) return false
  const group = groupSnap.data()
  if (!group.members?.includes(fromId)) return false

  const writer = db.bulkWriter()
  const [expenses, settlements, incomes] = await Promise.all([
    groupRef.collection('expenses').get(),
    groupRef.collection('settlements').get(),
    groupRef.collection('incomes').get(),
  ])

  // 搬移後 toUid 參與分攤的支出有幾筆（splits 內有 toUid 的）。toUid 原本就在群組時，筆數要靠它重算（見下方）
  let toUidParticipations = 0
  expenses.docs.forEach((d) => {
    const data = d.data()
    const patch = migrationPatch(data, MIGRATION_FIELDS.expenses, fromId, toUid)
    if (patch) writer.update(d.ref, patch)
    if (toUid in (patch?.splits ?? data.splits ?? {})) toUidParticipations += 1
  })

  settlements.docs.forEach((d) => {
    const data = d.data()
    const patch = migrationPatch(data, MIGRATION_FIELDS.settlements, fromId, toUid)
    if (!patch) return
    if (isSelfTransferAfterMove(data, fromId, toUid)) writer.delete(d.ref)
    else writer.update(d.ref, patch)
  })

  incomes.docs.forEach((d) => {
    const patch = migrationPatch(d.data(), MIGRATION_FIELDS.incomes, fromId, toUid)
    if (patch) writer.update(d.ref, patch)
  })

  await writer.close()

  const profiles = { ...(group.memberProfiles || {}) }
  const fromProfile = { ...profiles[fromId] }
  delete fromProfile.placeholder
  delete profiles[fromId]
  profiles[toUid] = profiles[toUid] || { ...fromProfile, ...profileOverride }

  const groupPatch = {
    members: [...new Set(group.members.map((m) => swapId(m, fromId, toUid)))],
    memberProfiles: profiles,
  }
  const balances = moveKey(group.memberBalances, fromId, toUid)
  if (balances) groupPatch.memberBalances = balances
  const counts = moveKey(group.memberExpenseCounts, fromId, toUid)
  if (counts) {
    // memberExpenseCounts 是「參與分攤的支出筆數」，兩個帳號可能參與同一筆支出，直接相加會重複計算（餘額是可加的，筆數不是）。
    // toUid 原本就在群組時改以搬移後的支出文件重算；否則 fromId 的筆數直接搬給 toUid 就是正確的
    if (group.members.includes(toUid)) counts[toUid] = toUidParticipations
    groupPatch.memberExpenseCounts = counts
  }
  if (group.createdBy === fromId) groupPatch.createdBy = toUid
  await groupRef.update(groupPatch)
  return true
}

// ---------- 以 uid 反查所屬群組、整批搬移 ----------

// 回傳 [{ id, ...群組欄位 }]
export const findGroupsOf = async (db, uid) => {
  const snap = await db.collection('groups').where('members', 'array-contains', uid).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * 把 dropUid 所在的所有群組逐一併入 keepUid。單一群組失敗不會中斷其他群組，失敗的群組 id 回傳給呼叫端決定如何重試
 * （migrateMember 可重複執行，已搬完的群組會自動略過）。
 */
export const migrateAllGroups = async (db, keepUid, dropUid) => {
  assertMergeable(keepUid, dropUid)
  const groups = await findGroupsOf(db, dropUid)
  const migrated = []
  const failed = []
  for (const g of groups) {
    try {
      if (await migrateMember(db, g.id, dropUid, keepUid)) migrated.push(g.id)
    } catch (e) {
      console.error('migrateAllGroups error', g.id, e)
      failed.push(g.id)
    }
  }
  return { migrated, failed }
}

// ---------- 個人資料（users/{uid} 底下的所有子集合） ----------

// 遞迴列出 users/{uid} 底下所有文件，父文件排在子文件前面；回傳 [{ path, ref }]，path 相對於 users/{uid}。
// listDocuments 也會列出「本身不存在、只有子集合」的文件，呼叫端要用 get().exists 區分
const collectTree = async (docRef, prefix = '') => {
  const out = []
  for (const col of await docRef.listCollections()) {
    for (const ref of await col.listDocuments()) {
      const path = `${prefix}${col.id}/${ref.id}`
      out.push({ path, ref })
      out.push(...await collectTree(ref, `${path}/`))
    }
  }
  return out
}

// 讀出 users/{uid} 底下所有存在的文件 [{ path, data }]（備份用）
export const readPersonalTree = async (db, uid) => {
  const out = []
  for (const { path, ref } of await collectTree(db.doc(`users/${uid}`))) {
    const snap = await ref.get()
    if (snap.exists) out.push({ path, data: snap.data() })
  }
  return out
}

/**
 * 列出被併入帳號的個人資料，以及哪些文件在保留帳號那邊也有同路徑（衝突）。
 * 收款方式、付款方式、儲蓄目標（含存提款紀錄）都是自動產生的 id，幾乎不會衝突；
 * 真正會衝突的是固定 id 的文件，例如 settings/profile（暱稱）、settings/oaPrompt。
 * 回傳 { docCount, conflicts: [{ path, keepUpdatedMs, dropUpdatedMs }] }；settings/profile 另帶 keepNickname、dropNickname。
 */
export const listPersonalConflicts = async (db, keepUid, dropUid) => {
  assertMergeable(keepUid, dropUid)
  let docCount = 0
  const conflicts = []
  for (const { path, ref } of await collectTree(db.doc(`users/${dropUid}`))) {
    const snap = await ref.get()
    if (!snap.exists) continue
    docCount += 1
    const target = await db.doc(`users/${keepUid}/${path}`).get()
    if (target.exists) {
      const conflict = { path, keepUpdatedMs: target.updateTime.toMillis(), dropUpdatedMs: snap.updateTime.toMillis() }
      // 暱稱衝突把雙方的暱稱一併帶上，確認頁才能讓使用者看懂要選哪個（其他路徑的內容不外傳）
      if (path === 'settings/profile') {
        conflict.keepNickname = target.data().nickname ?? null
        conflict.dropNickname = snap.data().nickname ?? null
      }
      conflicts.push(conflict)
    }
  }
  return { docCount, conflicts }
}

/**
 * 把 users/{dropUid} 底下的資料搬到 users/{keepUid}（不含 users/{dropUid} 這份文件本身，它在合併最後與 Auth 一起刪）。
 * - 保留帳號那邊沒有的文件：直接複製。
 * - 保留帳號那邊也有的（衝突）：依 resolutions[path]，'drop' 用被併入帳號的覆蓋，'keep'（沒指定也視為 keep）保留原本的。
 * 先全部複製完才刪來源，所以中途失敗可以重試：已複製的文件在重試時看起來像「衝突」，
 * 但沒指定 resolution 時預設 keep，資料相同、不會有影響；真正的衝突則用同一份 resolutions 再套用一次。
 * 回傳 { copied, overwritten, skipped }。
 */
export const movePersonalData = async (db, keepUid, dropUid, resolutions = {}) => {
  assertMergeable(keepUid, dropUid)
  const items = []
  for (const { path, ref } of await collectTree(db.doc(`users/${dropUid}`))) {
    const snap = await ref.get()
    if (snap.exists) items.push({ path, ref, data: snap.data() })
  }

  const stats = { copied: 0, overwritten: 0, skipped: 0 }
  for (const { path, data } of items) {
    const targetRef = db.doc(`users/${keepUid}/${path}`)
    try {
      await targetRef.create(data)
      stats.copied += 1
    } catch (e) {
      if (e.code !== ALREADY_EXISTS) throw e
      if (resolutions[path] === 'drop') {
        await targetRef.set(data)
        stats.overwritten += 1
      } else {
        stats.skipped += 1
      }
    }
  }

  // 全部複製成功才刪來源；子文件排在父文件後面，倒著刪就是先子後父
  for (const { ref } of [...items].reverse()) await ref.delete()
  return stats
}

// ---------- 預覽（dry-run） ----------

/**
 * 合併前的預覽：不寫入任何資料。uidA、uidB 兩個帳號誰保留由 chooseKeepUid 決定（群組數較多者）。
 * 回傳受影響的群組（兩邊都在 / 只有被併入帳號在）、各群組帳目會被改動的筆數、會被刪除的自己轉給自己的轉帳、
 * 以及個人資料的數量與衝突（自動處理的與需要使用者決定的，各附預設建議）。
 */
export const buildMergePreview = async (db, uidA, uidB) => {
  assertMergeable(uidA, uidB)
  const [groupsA, groupsB] = await Promise.all([findGroupsOf(db, uidA), findGroupsOf(db, uidB)])
  const { keepUid, dropUid } = chooseKeepUid(
    { uid: uidA, groupCount: groupsA.length },
    { uid: uidB, groupCount: groupsB.length },
  )
  const dropGroups = dropUid === uidA ? groupsA : groupsB
  const groups = classifyGroups(dropGroups, keepUid, dropUid)

  const impact = { expenses: 0, settlements: 0, incomes: 0, selfTransfers: 0 }
  for (const g of dropGroups) {
    const ref = db.doc(`groups/${g.id}`)
    const [e, s, i] = await Promise.all([
      ref.collection('expenses').get(), ref.collection('settlements').get(), ref.collection('incomes').get(),
    ])
    const part = countMigrationImpact(
      { expenses: e.docs.map((d) => d.data()), settlements: s.docs.map((d) => d.data()), incomes: i.docs.map((d) => d.data()) },
      dropUid, keepUid,
    )
    for (const k of Object.keys(impact)) impact[k] += part[k]
  }

  const personal = await listPersonalConflicts(db, keepUid, dropUid)
  return {
    keepUid,
    dropUid,
    groups,
    impact,
    personal: { docCount: personal.docCount, ...classifyPersonalConflicts(personal.conflicts) },
  }
}
