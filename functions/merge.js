// 帳號合併用的純函式（不碰 Firestore，方便用 node:test 直接測）。
// 設計見 docs/superpowers/specs/2026-11-14-p14-identity-design.md 的「合併」；Firestore 操作在 memberOps.js。
import { swapId, MIGRATION_FIELDS, migrationPatch } from './migrate.js'

// 訪客（虛擬成員）的 id 以 p_ 開頭，不是真正的帳號，不能參與合併
export const isGuestUid = (uid) => typeof uid === 'string' && uid.startsWith('p_')

// 合併的兩個 uid 必須是兩個不同的、非訪客的字串
export const assertMergeable = (uidA, uidB) => {
  for (const uid of [uidA, uidB]) {
    if (typeof uid !== 'string' || !uid) throw new Error('invalid_uid')
    if (isGuestUid(uid)) throw new Error('guest_not_mergeable')
  }
  if (uidA === uidB) throw new Error('same_uid')
}

/**
 * 決定保留哪個 uid（另一個被併入）：群組數較多者保留，需要搬動的資料最少；一樣多時保留 a。
 * 對使用者而言保留哪個 uid 沒有差別，所以不讓使用者選。a、b 為 { uid, groupCount }。
 */
export const chooseKeepUid = (a, b) => {
  const keep = b.groupCount > a.groupCount ? b : a
  const drop = keep === a ? b : a
  return { keepUid: keep.uid, dropUid: drop.uid }
}

// ---------- 群組 ----------

/**
 * 把「被併入帳號（dropUid）所在的群組」分成兩類：
 * - bothIn：保留帳號也在，兩邊的金額、餘額、筆數會相加（自動處理，不讓使用者選）
 * - dropOnly：只有被併入帳號在，成員身分直接改成保留帳號
 * groups 為 [{ id, name, members }]。
 */
export const classifyGroups = (groups, keepUid, dropUid) => {
  const bothIn = []
  const dropOnly = []
  for (const g of groups) {
    const members = g.members || []
    if (!members.includes(dropUid)) continue
    const item = { id: g.id, name: g.name ?? null }
    if (members.includes(keepUid)) bothIn.push(item)
    else dropOnly.push(item)
  }
  return { bothIn, dropOnly }
}

// 把 fromId 換成 toUid 之後，這筆轉帳會變成自己轉給自己（from === to）
export const isSelfTransferAfterMove = (settlement, fromId, toUid) =>
  swapId(settlement.from, fromId, toUid) === swapId(settlement.to, fromId, toUid)

/**
 * 預估一個群組的帳目會被改動多少：各集合有幾筆文件會被修改，以及其中有幾筆轉帳會變成自己轉給自己（會被刪除）。
 * 轉帳對餘額是對沖（from 加、to 減同一金額），自己轉給自己淨效果為 0，所以刪除不會改變任何餘額。
 */
export const countMigrationImpact = ({ expenses = [], settlements = [], incomes = [] }, fromId, toUid) => {
  const touched = (docs, fields) => docs.filter((d) => migrationPatch(d, fields, fromId, toUid)).length
  return {
    expenses: touched(expenses, MIGRATION_FIELDS.expenses),
    settlements: touched(settlements, MIGRATION_FIELDS.settlements),
    incomes: touched(incomes, MIGRATION_FIELDS.incomes),
    selfTransfers: settlements.filter((s) => migrationPatch(s, MIGRATION_FIELDS.settlements, fromId, toUid)
      && isSelfTransferAfterMove(s, fromId, toUid)).length,
  }
}

// ---------- 個人資料衝突 ----------

// 兩個帳號都有、且使用者不需要決定的固定 id 文件（相對於 users/{uid} 的路徑）：一律保留較新的
export const AUTO_RESOLVED_PATHS = ['settings/oaPrompt']

/**
 * 衝突的預設建議：較新的那份（以文件的最後更新時間比較），一樣新就保留 keepUid 的。
 * conflict 為 { path, keepUpdatedMs, dropUpdatedMs }；回傳 'keep'（用保留帳號的）或 'drop'（用被併入帳號的）。
 */
export const defaultResolution = (conflict) => (conflict.dropUpdatedMs > conflict.keepUpdatedMs ? 'drop' : 'keep')

// 把衝突分成「自動處理」與「需要使用者決定」兩組，各自附上預設建議
export const classifyPersonalConflicts = (conflicts) => {
  const auto = []
  const needsChoice = []
  for (const c of conflicts) {
    const item = { ...c, suggested: defaultResolution(c) }
    if (AUTO_RESOLVED_PATHS.includes(c.path)) auto.push(item)
    else needsChoice.push(item)
  }
  return { auto, needsChoice }
}

/**
 * 組出完整的解決方案 { path: 'keep' | 'drop' }：自動處理的用預設建議；需要使用者決定的用 userChoices，沒指定就用預設建議。
 * userChoices 裡出現不是「需要使用者決定」的路徑，或值不是 'keep' / 'drop' 都會丟錯，避免靜默忽略。
 * 預覽時就把完整結果存起來，執行與重試都用同一份（見 memberOps.movePersonalData）。
 */
export const buildResolutions = (conflicts, userChoices = {}) => {
  const { auto, needsChoice } = classifyPersonalConflicts(conflicts)
  const askable = new Set(needsChoice.map((c) => c.path))
  for (const [path, value] of Object.entries(userChoices)) {
    if (!askable.has(path)) throw new Error(`unknown_conflict_path: ${path}`)
    if (value !== 'keep' && value !== 'drop') throw new Error(`invalid_resolution: ${path}`)
  }
  const resolutions = {}
  for (const c of auto) resolutions[c.path] = c.suggested
  for (const c of needsChoice) resolutions[c.path] = userChoices[c.path] ?? c.suggested
  return resolutions
}
