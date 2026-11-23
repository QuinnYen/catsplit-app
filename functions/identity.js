// 身分對照用的純函式（沒有任何 import，方便用 node:test 直接測）
// identities/{provider:subject} → { uid }：登入方式與內部 uid 的對照，設計見 docs/superpowers/specs/2026-11-14-p14-identity-design.md

export const PROVIDERS = ['line', 'google']

// 內部 uid：u_ + 20 位十六進位。不能以 p_ 開頭（訪客 id 與 rules 依賴）
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

// ---------- Google ----------

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

// 顯示名稱：去掉控制字元、頭尾空白，最多 max 個字（以字元計，不會切壞中文或 emoji）；不是字串就回空字串
export const cleanDisplayName = (value, max = 50) => {
  if (typeof value !== 'string') return ''
  const cleaned = Array.from(value).filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join('').trim()
  return Array.from(cleaned).slice(0, max).join('')
}

/**
 * Google 登入要用哪個 uid：
 * - 對照表已有 → 用對照表的 uid
 * - 沒有 → 用新的內部 uid（newUid）並要求建立對照項；Google 使用者沒有「沿用舊 uid」的歷史包袱
 */
export const resolveGoogleUid = ({ identity, newUid }) => {
  if (identity && typeof identity.uid === 'string' && identity.uid) {
    return { uid: identity.uid, create: false }
  }
  return { uid: newUid, create: true }
}

// 從已通過簽章驗證的 Google ID token payload 取出身分：只信 sub 當身分，名字僅供預設顯示
export const googleProfileFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') throw new Error('invalid_payload')
  if (!GOOGLE_ISSUERS.includes(payload.iss)) throw new Error('invalid_issuer')
  identityKey('google', payload.sub) // 順便檢查 sub 能安全當成文件 id
  return { subject: payload.sub, name: cleanDisplayName(payload.name ?? payload.given_name), picture: typeof payload.picture === 'string' ? payload.picture : null }
}

/**
 * Google 登入換發流程（相依都由外面注入，方便測試）：驗證 ID token → 查表或建立 uid → 同步使用者資料 → 發 custom token。
 * 回傳 { status, body }。驗證失敗回 401；其他非預期錯誤直接丟出（呼叫端轉成 500）。
 */
export const exchangeGoogleLogin = async ({ idToken, verifyGoogle, resolveUid, syncProfile, createToken }) => {
  if (typeof idToken !== 'string' || !idToken || idToken.length > 4096) {
    return { status: 400, body: { error: 'missing_params' } }
  }
  let profile
  try {
    profile = googleProfileFromPayload(await verifyGoogle(idToken))
  } catch {
    return { status: 401, body: { error: 'id_token_invalid' } }
  }
  const { uid, isNew } = await resolveUid(profile.subject)
  // syncProfile 回傳這個帳號目前顯示用的 { name, avatar, provider }（LINE 優先，見 profile.js）；
  // displayName 仍是 Google 上的名字（首次設定暱稱的預設），name、avatar、provider 才是帳號實際的
  const shown = (await syncProfile(uid, profile.name, profile.picture)) ?? {}
  const firebaseToken = await createToken(uid)
  return { status: 200, body: { uid, isNew, displayName: profile.name, name: shown.name ?? profile.name, avatar: shown.avatar ?? null, provider: shown.provider ?? null, firebaseToken } }
}

/**
 * LINE 登入要用哪個 uid：
 * - 對照表已有 → 用對照表的 uid（帳號合併後，LINE 身分可能指向別的 uid）
 * - 沒有 → 全新的 LINE 使用者，用新的內部 uid（newUid，u_ 開頭）並要求建立對照項
 */
export const resolveLineUid = ({ identity, newUid }) => {
  if (identity && typeof identity.uid === 'string' && identity.uid) {
    return { uid: identity.uid, create: false }
  }
  return { uid: newUid, create: true }
}
