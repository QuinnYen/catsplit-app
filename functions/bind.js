// 綁定與合併流程用的純函式（不碰 Firestore、不連外，方便用 node:test 直接測）。
// Firestore 操作在 mergeFlow.js，HTTP 端點在 index.js。設計見 docs/superpowers/specs/2026-11-14-p14-identity-design.md。

export const MERGE_PREVIEW_TTL_MS = 10 * 60 * 1000 // 預覽後 10 分鐘內要確認，逾時需重新驗證
export const MERGE_PREVIEW_RECORD_TTL_MS = 24 * 60 * 60 * 1000 // 沒人確認的預覽紀錄，一天後清除
export const MERGE_DONE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 合併完成的紀錄與備份保留 30 天
export const MERGE_LEASE_MS = 6 * 60 * 1000 // 執行中的租約，比函式逾時（5 分鐘）稍長，避免上一次還在跑時被重複啟動
export const PROOF_MAX_AGE_MS = 10 * 60 * 1000 // Google ID token 簽發後多久內才接受來綁定

// 有 status 的錯誤，端點直接轉成 HTTP 回應
export class MergeError extends Error {
  constructor(code, status = 400, extra = {}) {
    super(code)
    this.code = code
    this.status = status
    this.extra = extra
  }
}

// ---------- 請求 ----------

const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max

/**
 * 解析 bindIdentity 的請求，只接受三種形狀：
 *  Google：{ provider: 'google', idToken }
 *  LINE（外部瀏覽器）：{ provider: 'line', code, redirectUri }，redirectUri 必須是我們網域的 /auth/callback
 *  LINE（LINE 內）：{ provider: 'line', liffIdToken }
 */
export const parseBindRequest = (body, { allowedOrigins }) => {
  const b = body && typeof body === 'object' ? body : {}
  if (b.provider === 'google' && isStr(b.idToken, 4096)) return { provider: 'google', idToken: b.idToken }
  if (b.provider === 'line' && isStr(b.liffIdToken, 4096)) return { provider: 'line', liffIdToken: b.liffIdToken }
  if (b.provider === 'line' && isStr(b.code, 1024) && isStr(b.redirectUri, 512)) {
    const ok = [...allowedOrigins].some((origin) => b.redirectUri === `${origin}/auth/callback`)
    if (ok) return { provider: 'line', code: b.code, redirectUri: b.redirectUri }
  }
  throw new MergeError('invalid_request', 400)
}

// 憑證要夠新才能拿來綁定（避免外洩的舊 token 被拿來把別人的帳號併進自己的）。iat 單位是秒
export const isFreshProof = (iatSeconds, nowMs, maxAgeMs = PROOF_MAX_AGE_MS) => {
  if (typeof iatSeconds !== 'number' || !Number.isFinite(iatSeconds)) return false
  const ageMs = nowMs - iatSeconds * 1000
  return ageMs <= maxAgeMs && ageMs >= -60 * 1000
}

// ---------- 綁定決策 ----------

/**
 * 呼叫者（callerUid）要綁定身分 provider:subject，依對照表現況決定怎麼做：
 * - 對照表已有：同一個 uid → already_bound；別的 uid → merge（兩個帳號都有資料，要合併）
 * - 對照表沒有：create（新增一筆對照項指向呼叫者）
 */
export const decideBind = ({ callerUid, identity }) => {
  if (identity && typeof identity.uid === 'string' && identity.uid) {
    return identity.uid === callerUid ? { action: 'already_bound' } : { action: 'merge', otherUid: identity.uid }
  }
  return { action: 'create' }
}

/**
 * 解除綁定的規劃。identities 是呼叫者目前所有的對照項 [{ id, uid, provider, subject }]。
 * - 至少保留一種登入方式；解除就是刪除那個對照項，之後用這個登入方式登入的是新帳號
 */
export const planUnbind = ({ callerUid, identities, targetId }) => {
  const target = identities.find((i) => i.id === targetId)
  if (!target || target.uid !== callerUid) return { ok: false, error: 'identity_not_found' }
  if (identities.length <= 1) return { ok: false, error: 'last_identity' }
  return { ok: true }
}

// ---------- 合併紀錄與狀態 ----------

export const MERGE_STATES = ['previewed', 'started', 'groups_done', 'profile_done', 'done']
export const stateRank = (state) => MERGE_STATES.indexOf(state)
export const isInProgress = (state) => ['started', 'groups_done', 'profile_done'].includes(state)

// 同一對帳號固定同一份紀錄（不分先後），所以同一對帳號不會同時有兩個合併
export const mergeDocId = (uidA, uidB) => {
  for (const uid of [uidA, uidB]) {
    if (typeof uid !== 'string' || !uid || /[/]/.test(uid)) throw new MergeError('invalid_uid', 400)
  }
  const [lo, hi] = [uidA, uidB].sort()
  return `${lo}.${hi}`
}

/**
 * 預覽通過後存進 merges/{id} 的紀錄。
 */
export const buildMergeRecord = ({ callerUid, otherUid, preview, nowMs }) => ({
  uids: [callerUid, otherUid],
  initiatorUid: callerUid,
  keepUid: preview.keepUid,
  dropUid: preview.dropUid,
  state: 'previewed',
  preview: { groups: preview.groups, impact: preview.impact, personal: preview.personal },
  resolutions: null,
  backupDone: false,
  failedGroups: [],
  lease: null,
  createdAtMs: nowMs,
  expiresAtMs: nowMs + MERGE_PREVIEW_TTL_MS, // 這時間前要確認
  expireAtMs: nowMs + MERGE_PREVIEW_RECORD_TTL_MS, // 清除排程用：沒人確認的預覽一天後刪
  startedAtMs: null,
  finishedAtMs: null,
})

/**
 * 呼叫 executeMerge 時，依紀錄現況決定怎麼辦：
 * not_found / forbidden（不是發起人）/ done（已完成，直接回結果）/ busy（上一次還在執行）/
 * expired（預覽逾時）/ run（開始或從斷點繼續）
 */
export const planExecute = (merge, callerUid, nowMs) => {
  if (!merge) return { action: 'not_found' }
  if (merge.initiatorUid !== callerUid) return { action: 'forbidden' }
  if (merge.state === 'done') return { action: 'done' }
  if (merge.lease && merge.lease.untilMs > nowMs) return { action: 'busy' }
  if (merge.state === 'previewed' && merge.expiresAtMs <= nowMs) return { action: 'expired' }
  return { action: 'run', fromState: merge.state }
}

// 把使用者的選擇與預覽時的衝突清單合成完整解決方案時用到的衝突清單（自動處理與需要決定的合在一起）
export const conflictsOf = (merge) => [
  ...(merge.preview?.personal?.auto ?? []),
  ...(merge.preview?.personal?.needsChoice ?? []),
].map(({ path, keepUpdatedMs, dropUpdatedMs }) => ({ path, keepUpdatedMs, dropUpdatedMs }))
