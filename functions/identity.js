// 身分對照用的純函式（沒有任何 import，方便用 node:test 直接測）
// identities/{provider:subject} → { uid }：登入方式與內部 uid 的對照，設計見 docs/superpowers/specs/2026-11-14-p14-identity-design.md

export const PROVIDERS = ['line', 'google']

// 內部 uid：u_ + 20 位十六進位。不能以 p_ 開頭（訪客 id 與 rules 依賴），LINE userId 不含底線，不會撞號
const INTERNAL_UID_RE = /^u_[0-9a-f]{20}$/
export const isInternalUid = (id) => typeof id === 'string' && INTERNAL_UID_RE.test(id)

// randomBytes 可注入（測試用）；預設用 Web Crypto
export const makeUid = (randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))) =>
  `u_${Array.from(randomBytes(10), (b) => b.toString(16).padStart(2, '0')).join('')}`

// Firestore 文件 id 不能含 /，也不能是 . 或 ..；subject 只接受常見安全字元，其他一律拒絕
const SUBJECT_RE = /^[A-Za-z0-9_-]{1,128}$/

export const identityKey = (provider, subject) => {
  if (!PROVIDERS.includes(provider)) throw new Error(`invalid_provider: ${provider}`)
  if (typeof subject !== 'string' || !SUBJECT_RE.test(subject)) throw new Error('invalid_subject')
  return `${provider}:${subject}`
}

/**
 * LINE 登入要用哪個 uid：
 * - 對照表已有 → 用對照表的 uid（日後帳號合併後，LINE 身分可能指向別的 uid）
 * - 對照表沒有 → 沿用 LINE userId 當 uid（現有與新的 LINE 使用者都一樣，資料不用搬），並要求建立對照項
 */
export const resolveLineUid = ({ identity, lineUserId }) => {
  if (identity && typeof identity.uid === 'string' && identity.uid) {
    return { uid: identity.uid, create: false }
  }
  return { uid: lineUserId, create: true }
}
