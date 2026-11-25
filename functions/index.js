import { onRequest } from 'firebase-functions/v2/https'
import { onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { randomBytes } from 'node:crypto'
import { migrateMember as migrateMemberOp } from './memberOps.js'
import { deleteLedgerTree, deleteAllLedgers, isValidLedgerId, ledgerExportPrefix } from './ledgerOps.js'
import { MergeError, parseBindRequest, isFreshProof } from './bind.js'
import {
  bindIdentity as bindIdentityFlow, executeMerge as executeMergeFlow, unbindIdentity as unbindIdentityFlow,
  listIdentitiesOf, purgeExpired, deleteMergeDataOf,
} from './mergeFlow.js'
import { createLinkCode as createLinkCodeFlow, redeemLinkCode as redeemLinkCodeFlow, deleteLinkCodesOf } from './linkFlow.js'
import { OAuth2Client } from 'google-auth-library'
import { identityKey, resolveLineUid, resolveGoogleUid, makeUid, exchangeGoogleLogin, googleProfileFromPayload } from './identity.js'
import { normalizeHl, previewText } from './sharePreview.js'
import { nextProfile } from './profile.js'

initializeApp()

const LINE_CHANNEL_ID = '2010062826'
// Google OAuth 用戶端 ID（網頁應用程式）。不是機密，前端也會用（src/config/google.js）；驗證 ID token 時當作 audience
const GOOGLE_CLIENT_ID = '210729139240-84a2bkkvtklu8qkj0fqhrgh9qu8l8goi.apps.googleusercontent.com'
const googleClient = new OAuth2Client()
const LINE_CHANNEL_SECRET = defineSecret('LINE_CHANNEL_SECRET')

const ALLOWED_ORIGINS = new Set([
  'https://catsplit-app.web.app',
  'https://catsplit-app.firebaseapp.com',
  'http://localhost:5173',
])

const setCors = (req, res) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.set('Access-Control-Max-Age', '3600')
}

// 把 LINE 名稱與頭像寫進 users/{uid}，方便在 Console 用 UID 反查是誰；失敗不影響登入。
// rules 沒有開放 users/{uid} 本身（只開 paymentMethods 子集合），客戶端讀寫都會被拒，只有 Admin SDK 寫得進去。
// 刪除我的資料時由 detachMember 一併刪除。
// 每個登入方式的名稱與頭像各存一份（names / avatars 的 line、google），顯示用的 name、avatar、provider 由規則決定
// （LINE 優先，見 profile.js）；回傳寫入的 { name, avatar, provider }（失敗時回 null）
const syncUserProfile = async (uid, loginProvider, { name, picture }) => {
  try {
    const db = getFirestore()
    const ref = db.doc(`users/${uid}`)
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const next = nextProfile(snap.exists ? snap.data() : null, loginProvider, { name, picture })
      tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      return { name: next.name, avatar: next.avatar, provider: next.provider }
    })
  } catch (e) {
    console.error('syncUserProfile error', e)
    return null
  }
}

// 查 identities/line:{userId} 決定這個 LINE 使用者的內部 uid；沒有對照項就是全新的使用者，用新的內部 uid（u_ 開頭）並建立對照項。
// 在 transaction 內完成，避免並行登入建出兩筆。對照表只有 Admin SDK 讀寫得到（rules 全拒）。
// 帳號合併之後，對照項可能指向別的 uid，查表失敗時不能另外給一個 uid，否則會登入到錯的帳號；失敗就讓登入失敗（呼叫端回 500），使用者重試即可。
const resolveUidForLine = async (lineUserId) => {
  const db = getFirestore()
  const ref = db.doc(`identities/${identityKey('line', lineUserId)}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const { uid, create } = resolveLineUid({ identity: snap.exists ? snap.data() : null, newUid: makeUid() })
    if (create) {
      tx.set(ref, { uid, provider: 'line', subject: lineUserId, createdAt: FieldValue.serverTimestamp() })
    }
    return uid
  })
}

export const lineLogin = onRequest(
  { secrets: [LINE_CHANNEL_SECRET], cors: false, region: 'asia-east1', maxInstances: 5 },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }

    const { code, redirectUri } = req.body || {}
    if (!code || !redirectUri) {
      res.status(400).json({ error: 'missing_params' })
      return
    }

    try {
      const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: LINE_CHANNEL_ID,
          client_secret: LINE_CHANNEL_SECRET.value(),
        }),
      })

      if (!tokenRes.ok) {
        const text = await tokenRes.text()
        console.error('LINE token exchange failed', tokenRes.status, text)
        res.status(401).json({ error: 'token_exchange_failed' })
        return
      }

      const tokenJson = await tokenRes.json()
      const { access_token, id_token } = tokenJson

      // 用 access_token 拿 profile（最穩定，不用解析 JWT）
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${access_token}` },
      })

      if (!profileRes.ok) {
        const text = await profileRes.text()
        console.error('LINE profile fetch failed', profileRes.status, text)
        res.status(502).json({ error: 'profile_fetch_failed' })
        return
      }

      const profile = await profileRes.json()
      const uid = await resolveUidForLine(profile.userId)
      await syncUserProfile(uid, 'line', { name: profile.displayName, picture: profile.pictureUrl })
      const firebaseToken = await getAuth().createCustomToken(uid)
      res.json({
        uid,
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
        idToken: id_token,
        firebaseToken,
      })
    } catch (e) {
      console.error('lineLogin error', e)
      res.status(500).json({ error: 'internal_error' })
    }
  }
)

export const verifyLiffToken = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }

    const { idToken } = req.body || {}
    if (!idToken) {
      res.status(400).json({ error: 'missing_params' })
      return
    }

    try {
      const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          id_token: idToken,
          client_id: LINE_CHANNEL_ID,
        }),
      })

      if (!verifyRes.ok) {
        const text = await verifyRes.text()
        console.error('LINE id_token verify failed', verifyRes.status, text)
        res.status(401).json({ error: 'id_token_invalid' })
        return
      }

      const claims = await verifyRes.json()
      const uid = await resolveUidForLine(claims.sub)
      await syncUserProfile(uid, 'line', { name: claims.name, picture: claims.picture })
      const firebaseToken = await getAuth().createCustomToken(uid)
      res.json({
        uid,
        userId: claims.sub,
        displayName: claims.name,
        pictureUrl: claims.picture,
        firebaseToken,
      })
    } catch (e) {
      console.error('verifyLiffToken error', e)
      res.status(500).json({ error: 'internal_error' })
    }
  }
)

// 查 identities/google:{sub}；沒有就產生新的內部 uid（u_…）並建立對照項，在 transaction 內完成，
// 避免同一個 Google 帳號從兩個裝置同時首次登入而建出兩個 uid。Google 沒有舊 uid 可沿用，所以查表失敗時直接讓登入失敗
const resolveUidForGoogle = async (subject) => {
  const db = getFirestore()
  const ref = db.doc(`identities/${identityKey('google', subject)}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    // 每次 transaction 重試都重新產生 uid；只有最後成功寫入的那一個會被保留
    const { uid, create } = resolveGoogleUid({ identity: snap.exists ? snap.data() : null, newUid: makeUid() })
    if (create) {
      tx.set(ref, { uid, provider: 'google', subject, createdAt: FieldValue.serverTimestamp() })
    }
    return { uid, isNew: create }
  })
}

/**
 * Google 登入：前端用 Google Identity Services 取得 ID token，這裡驗證簽章與 audience 後，
 * 以 google:{sub} 查對照表換成內部 uid，發 Firebase custom token。body { provider: 'google', idToken }。
 * 回傳 { uid, isNew, displayName, firebaseToken }；displayName 只是 Google 上的名字，供首次設定暱稱時當預設。
 */
export const authExchange = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }

    const { provider, idToken } = req.body || {}
    if (provider !== 'google') {
      res.status(400).json({ error: 'unsupported_provider' })
      return
    }

    try {
      const { status, body } = await exchangeGoogleLogin({
        idToken,
        verifyGoogle: async (token) => {
          const ticket = await googleClient.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID })
          return ticket.getPayload()
        },
        resolveUid: resolveUidForGoogle,
        // Google 的名稱與頭像只存自己那一份，不蓋掉 LINE 的；顯示用的由 syncUserProfile 決定並回傳
        syncProfile: (uid, name, picture) => syncUserProfile(uid, 'google', { name, picture }),
        createToken: (uid) => getAuth().createCustomToken(uid),
      })
      res.status(status).json(body)
    } catch (e) {
      console.error('authExchange error', e)
      res.status(500).json({ error: 'internal_error' })
    }
  }
)

// ---------- 綁定與帳號合併 ----------
// 已登入（非訪客）的使用者再通過第二種身分的驗證，就能把它綁到自己的帳號；
// 第二種身分若已是另一個有資料的帳號，要先預覽、確認後才合併（流程見 mergeFlow.js 與 docs/guides/identity-and-guests.md）。

// POST 端點共用的外殼：處理 CORS 與方法，requireAuth 時要求登入且不是訪客；並把 MergeError 轉成對應的 HTTP 狀態
const postHandler = (handler, { requireAuth }) => async (req, res) => {
  setCors(req, res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  let caller = null
  if (requireAuth) {
    caller = await verifyBearer(req)
    if (!caller || caller.guest) {
      res.status(401).json({ error: 'unauthenticated' })
      return
    }
  }
  try {
    res.json(await handler({ req, caller }))
  } catch (e) {
    if (e instanceof MergeError) {
      res.status(e.status).json({ error: e.code, ...e.extra })
      return
    }
    console.error('postHandler error', e)
    res.status(500).json({ error: 'internal_error' })
  }
}
// 需要登入且不是訪客的端點
const authedPost = (handler) => postHandler(handler, { requireAuth: true })
// 不需要登入的端點（憑證在請求內容裡，例如一次性連結碼）
const publicPost = (handler) => postHandler(handler, { requireAuth: false })

// 驗證第二種身分的憑證，回傳 { provider, subject }；憑證太舊或無效丟 MergeError(401)
const verifyProof = async (proof) => {
  const proofError = () => new MergeError('proof_invalid', 401)
  try {
    if (proof.provider === 'google') {
      const ticket = await googleClient.verifyIdToken({ idToken: proof.idToken, audience: GOOGLE_CLIENT_ID })
      const payload = ticket.getPayload()
      // Google ID token 簽發後 10 分鐘內才接受，避免外洩的舊 token 被拿來把別人的帳號併進自己的
      if (!isFreshProof(payload?.iat, Date.now())) throw new MergeError('proof_expired', 401)
      return { provider: 'google', subject: googleProfileFromPayload(payload).subject }
    }
    if (proof.liffIdToken) {
      const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: proof.liffIdToken, client_id: LINE_CHANNEL_ID }),
      })
      if (!res.ok) throw proofError()
      const claims = await res.json()
      identityKey('line', claims.sub)
      return { provider: 'line', subject: claims.sub }
    }
    // LINE 授權碼（外部瀏覽器）只能用一次
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: proof.code,
        redirect_uri: proof.redirectUri,
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET.value(),
      }),
    })
    if (!tokenRes.ok) throw proofError()
    const { access_token } = await tokenRes.json()
    const profileRes = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${access_token}` } })
    if (!profileRes.ok) throw proofError()
    const profile = await profileRes.json()
    identityKey('line', profile.userId)
    return { provider: 'line', subject: profile.userId }
  } catch (e) {
    if (e instanceof MergeError) throw e
    console.error('verifyProof error', e?.message || e)
    throw proofError()
  }
}

// 列出自己已綁定的登入方式（對照表客戶端讀不到），給設定頁的「登入方式」用
export const listIdentities = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  authedPost(async ({ caller }) => {
    const list = await listIdentitiesOf(getFirestore(), caller.uid)
    return { identities: list.map(({ id, provider, createdAtMs }) => ({ id, provider, createdAtMs })) }
  })
)

/**
 * 綁定第二種登入方式。body：{ provider: 'google', idToken } 或 { provider: 'line', code, redirectUri }（外部瀏覽器）
 * 或 { provider: 'line', liffIdToken }（LINE 內）。回傳 { status: 'bound' | 'already_bound' }，
 * 或 { status: 'merge_required', mergeId, ...預覽 }：對方是另一個有資料的帳號，要使用者確認後呼叫 executeMerge。
 * 憑證（尤其 LINE 授權碼只能用一次）在這一步驗證並直接產生預覽，之後的執行只需要 mergeId。
 */
export const bindIdentity = onRequest(
  { secrets: [LINE_CHANNEL_SECRET], cors: false, region: 'asia-east1', maxInstances: 5, timeoutSeconds: 120 },
  authedPost(async ({ req, caller }) => {
    const proof = parseBindRequest(req.body, { allowedOrigins: ALLOWED_ORIGINS })
    const { provider, subject } = await verifyProof(proof)
    return bindIdentityFlow(getFirestore(), { callerUid: caller.uid, provider, subject, nowMs: Date.now() })
  })
)

/**
 * 確認並執行合併。body：{ mergeId, resolutions? }，resolutions 是使用者對需要決定的衝突的選擇 { 路徑: 'keep' | 'drop' }。
 * 分階段、可重試（失敗時用同一個 mergeId 再呼叫一次即可從斷點繼續）。完成時回傳保留帳號的 custom token：
 * 若發起人是被併入而刪除的那個帳號，原本的 session 會失效，前端要用這個 token 重新登入。
 */
export const executeMerge = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5, timeoutSeconds: 300 },
  authedPost(async ({ req, caller }) => {
    const { mergeId, resolutions } = req.body || {}
    if (typeof mergeId !== 'string' || !mergeId || mergeId.length > 200 || mergeId.includes('/')) throw new MergeError('invalid_request', 400)
    if (resolutions !== undefined && (typeof resolutions !== 'object' || resolutions === null || Array.isArray(resolutions))) {
      throw new MergeError('invalid_request', 400)
    }
    const db = getFirestore()
    const result = await executeMergeFlow(db, {
      deleteAuthUser: (uid) => getAuth().deleteUser(uid).catch((e) => {
        if (e.code !== 'auth/user-not-found') throw e
      }),
      createToken: (uid) => getAuth().createCustomToken(uid),
    }, { mergeId, callerUid: caller.uid, userChoices: resolutions, runId: randomBytes(8).toString('hex') })
    // 順便清掉過期的合併紀錄與備份（沒有排程時的備援，失敗不影響合併結果）
    purgeExpired(db, Date.now(), 5).catch((e) => console.error('purgeExpired error', e))
    // 保留帳號的名稱與頭像：被併入的帳號是發起人時，原本的 session 失效，前端要用它重建登入狀態（users 文件客戶端讀不到）
    const keepProfile = (await db.doc(`users/${result.keepUid}`).get()).data() ?? {}
    return {
      ok: true,
      keepUid: result.keepUid,
      firebaseToken: result.firebaseToken,
      alreadyDone: result.alreadyDone,
      sessionReplaced: caller.uid !== result.keepUid,
      profile: { name: keepProfile.name ?? null, avatar: keepProfile.avatar ?? null, provider: keepProfile.provider ?? null },
    }
  })
)

// 解除一個登入方式。body：{ identityId }（listIdentities 回傳的 id）。至少要保留一種
export const unbindIdentity = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  authedPost(async ({ req, caller }) => {
    const { identityId } = req.body || {}
    if (typeof identityId !== 'string' || !identityId || identityId.length > 200 || identityId.includes('/')) throw new MergeError('invalid_request', 400)
    await unbindIdentityFlow(getFirestore(), { callerUid: caller.uid, identityId })
    return { ok: true }
  })
)

/**
 * 產生一次性連結碼（5 分鐘內有效、只能兌換一次），給「帶著登入狀態到外部瀏覽器」用。
 * LINE 內建瀏覽器無法用 Google 登入（Google 不允許在內嵌 WebView 登入），所以由已登入的 LINE 帳號產生碼，
 * 在手機的外部瀏覽器兌換（redeemLinkCode），再用手機上已登入的 Google 帳號完成綁定。回傳 { code, expiresAtMs }。
 */
export const createLinkCode = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  authedPost(async ({ caller }) => {
    const db = getFirestore()
    const result = await createLinkCodeFlow(db, { uid: caller.uid, nowMs: Date.now() })
    purgeExpired(db, Date.now(), 5).catch((e) => console.error('purgeExpired error', e))
    return result
  })
)

/**
 * 兌換一次性連結碼：不需要登入，碼本身就是憑證（256 位元隨機、單次、5 分鐘）。
 * 回傳該帳號的 custom token 與名稱、頭像，外部瀏覽器用它登入同一個帳號。body { code }。
 */
export const redeemLinkCode = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  publicPost(async ({ req }) => {
    const db = getFirestore()
    const { uid } = await redeemLinkCodeFlow(db, { code: req.body?.code, nowMs: Date.now() })
    const profile = (await db.doc(`users/${uid}`).get()).data() ?? {}
    return {
      uid,
      firebaseToken: await getAuth().createCustomToken(uid),
      profile: { name: profile.name ?? null, avatar: profile.avatar ?? null, provider: profile.provider ?? null },
    }
  })
)

// ---------- 訪客：選名字登入 / LINE 認領訪客名字 ----------

const verifyBearer = async (req) => {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '')
  if (!m) return null
  try {
    return await getAuth().verifyIdToken(m[1])
  } catch {
    return null
  }
}

// 把群組內 fromId 的紀錄與成員身分改成 toUid（實作在 memberOps.js，那邊接收 db 參數，方便在模擬器測試）
const migrateMember = (groupId, fromId, toUid, profileOverride = {}) =>
  migrateMemberOp(getFirestore(), groupId, fromId, toUid, profileOverride)

// 虛擬成員（訪客名字）的 id 一律以 p_ 開頭；LINE userId 不含底線，不會撞號
const isGuestId = (id) => typeof id === 'string' && /^p_[A-Za-z0-9]{1,40}$/.test(id)

const readGroup = async (groupId) => {
  if (typeof groupId !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(groupId)) return null
  const snap = await getFirestore().doc(`groups/${groupId}`).get()
  return snap.exists ? snap.data() : null
}

const guestList = (group) => group.members
  .filter((m) => isGuestId(m) && group.memberProfiles?.[m]?.placeholder)
  .map((m) => ({ id: m, name: group.memberProfiles[m].name }))

const MAX_MEMBERS = 50
const normalizeName = (n) => n.normalize('NFKC').trim().toLowerCase()

// 以訪客自己輸入的名字新增一位虛擬成員；同名（忽略大小寫與全半形）視為已存在
const createGuest = (groupId, name) => {
  const db = getFirestore()
  const groupRef = db.doc(`groups/${groupId}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(groupRef)
    const group = snap.data()
    const key = normalizeName(name)
    const taken = Object.values(group.memberProfiles || {}).some((p) => normalizeName(p?.name || '') === key)
    if (taken) return { error: 'name_taken' }
    if (group.members.length >= MAX_MEMBERS) return { error: 'group_full' }
    const memberId = `p_${randomBytes(10).toString('hex')}`
    tx.update(groupRef, {
      members: FieldValue.arrayUnion(memberId),
      [`memberProfiles.${memberId}`]: { name, avatar: null, placeholder: true },
    })
    return { memberId }
  })
}

/**
 * 訪客登入：不需要登入即可呼叫，持有群組連結即可。
 * - body { groupId }：回傳群組名稱與已有的訪客名字
 * - body { groupId, memberId }：以既有訪客名字登入
 * - body { groupId, name }：以自己輸入的名字新增訪客並登入（與群組內任何成員同名時回 409 name_taken）
 * 登入回傳 Firebase custom token（uid 即 memberId）。訪客名字不鎖定，誰都能選；想鎖定請綁定 LINE（見 claimMember）。
 */
export const guestLogin = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }

    const { groupId, memberId, name } = req.body || {}
    try {
      const group = await readGroup(groupId)
      if (!group) {
        res.status(404).json({ error: 'group_not_found' })
        return
      }

      let guestId = memberId
      if (name !== undefined) {
        const trimmed = typeof name === 'string' ? name.trim() : ''
        if (trimmed.length < 1 || trimmed.length > 20) {
          res.status(400).json({ error: 'invalid_name' })
          return
        }
        const result = await createGuest(groupId, trimmed)
        if (result.error) {
          res.status(409).json({ error: result.error })
          return
        }
        guestId = result.memberId
      } else if (memberId === undefined) {
        res.json({ groupName: group.name, guests: guestList(group) })
        return
      } else if (!guestList(group).some((g) => g.id === memberId)) {
        res.status(404).json({ error: 'guest_not_found' })
        return
      }

      const firebaseToken = await getAuth().createCustomToken(guestId, { guest: true, groupId })
      res.json({ firebaseToken, memberId: guestId, name: name !== undefined ? name.trim() : group.memberProfiles[guestId].name })
    } catch (e) {
      console.error('guestLogin error', e)
      res.status(500).json({ error: 'internal_error' })
    }
  }
)

/**
 * LINE 使用者認領訪客名字：把該名字的所有帳目搬到自己的 LINE 帳號，之後這個名字就只有本人能用。
 * 訪客綁定 LINE 也是走這支（登入 LINE 後認領自己原本的訪客名字）。
 */
export const claimMember = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }

    const caller = await verifyBearer(req)
    if (!caller || caller.guest) {
      res.status(401).json({ error: 'unauthenticated' })
      return
    }

    const { groupId, placeholderId, avatar } = req.body || {}
    try {
      const group = await readGroup(groupId)
      if (!group || !guestList(group).some((g) => g.id === placeholderId)) {
        res.status(404).json({ error: 'placeholder_not_found' })
        return
      }
      if (group.members.includes(caller.uid)) {
        res.status(409).json({ error: 'already_member' })
        return
      }
      const safeAvatar = typeof avatar === 'string' && avatar.startsWith('https://') && avatar.length <= 500 ? avatar : null
      await migrateMember(groupId, placeholderId, caller.uid, { avatar: safeAvatar })
      // 訪客 uid 已不在任何群組，刪掉它的 Auth 紀錄（同時讓還登入著這個名字的裝置失效）
      await getAuth().deleteUser(placeholderId).catch(() => {})
      res.json({ ok: true })
    } catch (e) {
      console.error('claimMember error', e)
      res.status(500).json({ error: 'internal_error' })
    }
  }
)

// ---------- 訪客 Auth 紀錄清理：訪客 uid（p_）離開 members 或群組被刪除後，刪掉它的 Auth 紀錄 ----------

const deleteGuestAuth = (ids) => Promise.all(
  ids.filter(isGuestId).map((id) => getAuth().deleteUser(id).catch((e) => {
    if (e.code !== 'auth/user-not-found') console.error('deleteGuestAuth error', id, e)
  }))
)

// Firestore 觸發器的 region 必須與資料庫位置相同
// 群組文件被刪（App、雲端函式或 Console 手動刪除）後：清訪客 Auth，並補刪留下的子集合與 Storage 檔案（收據、封面）。
// Console 刪文件不會連子集合與 Storage 一起刪；deleteGroupCompletely 可重複執行，App 已清乾淨時是空操作。
export const cleanupGuestsOnGroupDelete = onDocumentDeleted(
  { document: 'groups/{groupId}', region: 'asia-east1', timeoutSeconds: 300 },
  async (event) => {
    await deleteGuestAuth(event.data?.data()?.members || [])
    await deleteGroupCompletely(event.params.groupId)
  }
)

export const cleanupGuestsOnMemberRemoved = onDocumentUpdated(
  { document: 'groups/{groupId}', region: 'asia-east1' },
  (event) => {
    const before = event.data?.before.data()?.members || []
    const after = new Set(event.data?.after.data()?.members || [])
    return deleteGuestAuth(before.filter((m) => !after.has(m)))
  }
)

// ---------- 匯出 CSV：LINE 內建瀏覽器無法下載 blob，改給一個短效網址在外部瀏覽器下載 ----------

const EXPORT_URL_TTL_MS = 5 * 60 * 1000
const MAX_CSV_CHARS = 1_000_000

// 整個群組刪除：子集合（支出、轉帳）、群組文件與 Storage 檔案（收據、封面）
const deleteGroupCompletely = async (groupId) => {
  const bucket = getStorage().bucket()
  await Promise.all([
    bucket.deleteFiles({ prefix: `receipts/${groupId}/` }),
    bucket.deleteFiles({ prefix: `groups/${groupId}/` }),
  ])
  await getFirestore().recursiveDelete(getFirestore().doc(`groups/${groupId}`))
}

/**
 * 成員退出群組但保留帳目：把這位成員轉成訪客名字（沿用原本的名字、清掉頭像），之後別人可以認領。
 * 建立者退出時，先把建立者轉給最早加入的 LINE 成員；沒有其他 LINE 成員就整個群組刪除。
 * 先轉建立者、再改帳目：中途失敗時呼叫者仍是成員，重試即可繼續。
 * 回傳 'detached' | 'deleted' | 'skipped'（已不在群組，視為完成）。
 */
const detachFromGroup = async (groupId, uid) => {
  const group = await readGroup(groupId)
  if (!group || !group.members.includes(uid)) return 'skipped'
  if (group.createdBy === uid) {
    const successor = group.members.find((m) => m !== uid && !isGuestId(m))
    if (!successor) {
      await deleteGroupCompletely(groupId)
      return 'deleted'
    }
    await getFirestore().doc(`groups/${groupId}`).update({ createdBy: successor })
  }
  const guestId = `p_${randomBytes(10).toString('hex')}`
  const name = group.memberProfiles?.[uid]?.name || '前成員'
  await migrateMember(groupId, uid, guestId, { name, avatar: null, placeholder: true })
  return 'detached'
}

/**
 * 刪除整個群組（子集合、群組文件、Storage 檔案）。只有建立者能刪。body { groupId }。
 * 用後端的 recursiveDelete，沒有客戶端單一 batch 最多 500 個操作的上限。
 * 群組已經不存在視為成功（重試安全）。回傳 { ok: true }。
 */
export const deleteGroup = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5, timeoutSeconds: 300 },
  authedPost(async ({ req, caller }) => {
    const { groupId } = req.body || {}
    if (typeof groupId !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(groupId)) throw new MergeError('invalid_request', 400)
    const group = await readGroup(groupId)
    if (!group) return { ok: true, alreadyGone: true }
    if (group.createdBy !== caller.uid) throw new MergeError('forbidden', 403)
    await deleteGroupCompletely(groupId)
    return { ok: true }
  })
)

/**
 * 刪除自己的一個個人帳本（帳戶、帳目、群組連結與帳本文件）。需登入且不是訪客。body { ledgerId }。
 * 用後端的 recursiveDelete，沒有客戶端單一 batch 最多 500 個操作的上限；rules 也不讓客戶端刪帳本文件。
 * 只能刪呼叫者自己的帳本（路徑由 uid 組成）；帳本已經不存在視為成功（重試安全）。回傳 { ok: true }。
 */
export const deleteLedger = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5, timeoutSeconds: 300 },
  authedPost(async ({ req, caller }) => {
    const { ledgerId } = req.body || {}
    if (!isValidLedgerId(ledgerId)) throw new MergeError('invalid_request', 400)
    await deleteLedgerTree(getFirestore(), caller.uid, ledgerId)
    return { ok: true }
  })
)

/**
 * 退出多個群組並保留帳目（見 detachFromGroup）。需登入且不是訪客。body { groupIds: string[], deleteAccount?: boolean }。
 * deleteAccount 為 true 時，全部退出成功後再刪除這個人的 Auth 紀錄（此時群組清單可為空）；有任何失敗就不刪，讓使用者能重試。
 * 回傳 { results: { [groupId]: 結果 }, failed: string[], accountDeleted: boolean }。
 */
export const detachMember = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5, timeoutSeconds: 300 },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }

    const caller = await verifyBearer(req)
    if (!caller || caller.guest) {
      res.status(401).json({ error: 'unauthenticated' })
      return
    }

    const { groupIds, deleteAccount } = req.body || {}
    if (!Array.isArray(groupIds) || (groupIds.length === 0 && deleteAccount !== true) || groupIds.length > 100 || groupIds.some((g) => typeof g !== 'string')) {
      res.status(400).json({ error: 'invalid_group_ids' })
      return
    }

    const results = {}
    const failed = []
    for (const groupId of groupIds) {
      try {
        results[groupId] = await detachFromGroup(groupId, caller.uid)
      } catch (e) {
        console.error('detachMember error', groupId, e)
        failed.push(groupId)
      }
    }
    // 個人帳本要在刪 Auth 之前刪：中途失敗時帳號還在，使用者可以重試；先刪 Auth 就再也沒有身分能重試了
    if (deleteAccount === true && failed.length === 0) {
      try {
        await deleteAllLedgers(getFirestore(), caller.uid)
      } catch (e) {
        console.error('detachMember delete ledgers error', e)
        failed.push('ledgers')
      }
    }
    let accountDeleted = false
    if (deleteAccount === true && failed.length === 0) {
      try {
        await getAuth().deleteUser(caller.uid)
        accountDeleted = true
      } catch (e) {
        if (e.code === 'auth/user-not-found') accountDeleted = true
        else {
          console.error('detachMember deleteUser error', e)
          failed.push('account')
        }
      }
      if (accountDeleted) {
        try {
          await getFirestore().doc(`users/${caller.uid}`).delete()
        } catch (e) {
          console.error('detachMember delete users doc error', e)
          failed.push('profile')
        }
        // 身分對照項（identities）也要刪：LINE 或 Google 的 subject 不能在帳號刪除後還留著。
        // 放在刪 Auth 之後：先刪對照項再刪 Auth 若中途失敗，Google 使用者下次登入會被配到新的 uid，舊資料就找不回來
        try {
          const snap = await getFirestore().collection('identities').where('uid', '==', caller.uid).get()
          await Promise.all(snap.docs.map((d) => d.ref.delete()))
        } catch (e) {
          console.error('detachMember delete identities error', e)
          failed.push('identities')
        }
        // 牽涉到這個 uid 的合併紀錄與備份（備份裡有被併入帳號的資料）也一併刪除
        try {
          await deleteMergeDataOf(getFirestore(), caller.uid)
          await deleteLinkCodesOf(getFirestore(), caller.uid)
        } catch (e) {
          console.error('detachMember delete merge data error', e)
          failed.push('merges')
        }
      }
    }
    res.json({ results, failed, accountDeleted })
  }
)

/**
 * 把前端產生的 CSV 存到 Storage（exports/，由 bucket 的生命週期規則 1 天後清除），
 * 回傳 5 分鐘內有效的簽名網址，開啟即下載。需登入且是該群組成員（訪客也可）。
 * body { groupId, csv, filename }。簽名需要服務帳號有 Service Account Token Creator 權限（見 docs/guides/operations.md）。
 */
export const exportCsv = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }

    const caller = await verifyBearer(req)
    if (!caller) {
      res.status(401).json({ error: 'unauthenticated' })
      return
    }

    const { groupId, ledgerId, csv, filename } = req.body || {}
    if (typeof csv !== 'string' || csv.length === 0 || csv.length > MAX_CSV_CHARS) {
      res.status(400).json({ error: 'invalid_csv' })
      return
    }

    try {
      // 群組明細（groupId，必須是成員）或個人帳本（ledgerId，必須是自己的帳本）
      let prefix
      if (ledgerId !== undefined) {
        prefix = await ledgerExportPrefix(getFirestore(), caller.uid, ledgerId)
        if (!prefix) {
          res.status(403).json({ error: 'not_your_ledger' })
          return
        }
      } else {
        const group = await readGroup(groupId)
        if (!group || !group.members.includes(caller.uid)) {
          res.status(403).json({ error: 'not_a_member' })
          return
        }
        prefix = `exports/${groupId}`
      }

      // 檔名只留可見字元，去掉路徑與控制字元，一律以 .csv 結尾
      const base = String(filename || 'export').replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_').replace(/\.csv$/i, '').slice(0, 80) || 'export'
      const file = getStorage().bucket().file(`${prefix}/${randomBytes(16).toString('hex')}.csv`)
      await file.save(Buffer.from(csv, 'utf8'), { contentType: 'text/csv; charset=utf-8', resumable: false })
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + EXPORT_URL_TTL_MS,
        responseType: 'text/csv; charset=utf-8',
        responseDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(base + '.csv')}`,
      })
      res.json({ url })
    } catch (e) {
      console.error('exportCsv error', e)
      res.status(500).json({ error: 'internal_error' })
    }
  }
)

const SITE_ORIGIN = 'https://catsplit-app.web.app'
const TEMPLATE_TTL_MS = 60 * 1000
let templateCache = { html: null, at: 0 }

// 分享連結預覽用：Hosting 靜態檔就是 index.html，這裡抓回來再塞進群組專屬的 OG 標籤
const loadIndexHtml = async () => {
  if (templateCache.html && Date.now() - templateCache.at < TEMPLATE_TTL_MS) return templateCache.html
  const r = await fetch(`${SITE_ORIGIN}/index.html`)
  if (!r.ok) throw new Error(`index.html ${r.status}`)
  templateCache = { html: await r.text(), at: Date.now() }
  return templateCache.html
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/**
 * 分享連結 /s/:groupId：回傳 index.html，並依群組名稱與封面補上 og: 標籤，
 * 讓 LINE 等平台的連結預覽顯示該群組的封面。群組不存在時退回一般頁面。
 */
export const sharePage = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  async (req, res) => {
    const groupId = req.path.match(/^\/s\/([A-Za-z0-9]{1,40})\/?$/)?.[1]
    try {
      let html = await loadIndexHtml()
      const group = groupId ? await readGroup(groupId) : null
      const preview = previewText(group?.name, req.query.hl)
      const title = preview.title
      const image = typeof group?.coverUrl === 'string' && group.coverUrl.startsWith('https://')
        ? group.coverUrl
        : `${SITE_ORIGIN}/apple-touch-icon.png`
      const tags = [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="${escapeHtml(preview.site)}" />`,
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="${escapeHtml(preview.description)}" />`,
        `<meta property="og:image" content="${escapeHtml(image)}" />`,
      ].join('\n    ')
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`).replace('</head>', `    ${tags}\n  </head>`)
      if (normalizeHl(req.query.hl) === 'en') html = html.replace('<html lang="zh-Hant">', '<html lang="en">')
      res.set('Cache-Control', 'public, max-age=0, s-maxage=60')
      res.type('html').send(html)
    } catch (e) {
      console.error('sharePage error', e)
      res.redirect(302, groupId ? `/group/${groupId}` : '/')
    }
  }
)
