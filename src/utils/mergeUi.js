// 綁定與合併確認頁的顯示邏輯（純函式，方便用 node:test 直接測）。
// 預覽內容由雲端函式 bindIdentity 回傳（見 docs/identity-and-guests.md「綁定與合併的端點」）。

export const PREVIEW_STORAGE_KEY = 'catsplit_merge_preview'

/**
 * 使用者在確認頁選的是「目前登入的帳號」(initiator) 或「另一個帳號」(other)，
 * 雲端函式要的是「保留帳號的」(keep) 或「被併入帳號的」(drop)。
 * 發起人是被併入的那個帳號時 initiator 對應 drop，否則對應 keep。
 */
export const resolutionFromChoice = (choice, initiatorIsDropped) =>
  ((choice === 'initiator') === !!initiatorIsDropped ? 'drop' : 'keep')

export const choiceFromResolution = (resolution, initiatorIsDropped) =>
  ((resolution === 'drop') === !!initiatorIsDropped ? 'initiator' : 'other')

// 需要使用者決定的衝突，預設選項（雲端函式建議的，較新的那份）：{ 路徑: 'initiator' | 'other' }
export const initialChoices = (preview) =>
  Object.fromEntries((preview.personal?.needsChoice ?? []).map((c) => [c.path, choiceFromResolution(c.suggested, preview.initiatorIsDropped)]))

// 要送給 executeMerge 的選擇 { 路徑: 'keep' | 'drop' }；沒選的用雲端函式建議的
export const buildResolutionsPayload = (preview, choices) =>
  Object.fromEntries((preview.personal?.needsChoice ?? []).map((c) => [
    c.path,
    choices[c.path] ? resolutionFromChoice(choices[c.path], preview.initiatorIsDropped) : c.suggested,
  ]))

// 衝突項目的顯示名稱 key；沒有專屬名稱的回 null（畫面顯示路徑）
export const conflictLabelKey = (path) => (path === 'settings/profile' ? 'merge.conflict.nickname' : null)

// 暱稱衝突兩邊各是什麼：{ initiator, other }，沒有內容可顯示的路徑回 null
export const conflictValues = (conflict, initiatorIsDropped) => {
  if (!('keepNickname' in conflict)) return null
  const keep = conflict.keepNickname ?? null
  const drop = conflict.dropNickname ?? null
  return initiatorIsDropped ? { initiator: drop, other: keep } : { initiator: keep, other: drop }
}

export const isPreviewExpired = (preview, nowMs) => !preview || !(typeof preview.expiresAtMs === 'number') || nowMs >= preview.expiresAtMs

// 摘要數字：兩邊都在與只有一邊在的群組數、會更新的帳目筆數、自付轉帳數、搬移的個人資料筆數
export const summarizePreview = (preview) => ({
  bothIn: preview.groups?.bothIn?.length ?? 0,
  dropOnly: preview.groups?.dropOnly?.length ?? 0,
  records: (preview.impact?.expenses ?? 0) + (preview.impact?.settlements ?? 0) + (preview.impact?.incomes ?? 0),
  selfTransfers: preview.impact?.selfTransfers ?? 0,
  personalDocs: preview.personal?.docCount ?? 0,
})

// 雲端函式的錯誤碼 → 畫面訊息的 i18n key
const ERROR_KEYS = {
  unauthenticated: 'merge.err.session',
  proof_invalid: 'merge.err.proof',
  proof_expired: 'merge.err.proof',
  merge_not_found: 'merge.err.notFound',
  identity_not_found: 'merge.err.notFound',
  forbidden: 'merge.err.forbidden',
  preview_expired: 'merge.err.expired',
  merge_running: 'merge.err.running',
  groups_failed: 'merge.err.partial',
  merge_in_progress: 'merge.err.inProgress',
  other_merge_in_progress: 'merge.err.inProgress',
  same_uid: 'merge.err.sameAccount',
  last_identity: 'merge.err.lastIdentity',
  network: 'merge.err.network',
  link_invalid: 'link.invalid',
  link_expired: 'link.expired',
}
export const mergeErrorKey = (code) => ERROR_KEYS[code] ?? 'merge.err.generic'

// ---------- 預覽暫存（綁定頁與確認頁之間，LINE 授權會整頁跳轉，所以不能只放在記憶體） ----------

// 預覽存 10 分鐘就過期，所以用 localStorage 也不會留下舊資料；任何存取失敗都當作沒有
export const savePreview = (storage, preview, provider) => {
  try {
    storage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ ...preview, provider }))
  } catch { /* 存不了就算了，確認頁會提示重新綁定 */ }
}

export const loadPreview = (storage, nowMs) => {
  try {
    const preview = JSON.parse(storage.getItem(PREVIEW_STORAGE_KEY))
    if (!preview || typeof preview.mergeId !== 'string' || isPreviewExpired(preview, nowMs)) return null
    return preview
  } catch {
    return null
  }
}

export const clearPreview = (storage) => {
  try { storage.removeItem(PREVIEW_STORAGE_KEY) } catch { /* 沒有就算了 */ }
}
