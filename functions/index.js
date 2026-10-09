import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { randomBytes } from 'node:crypto'

initializeApp()

const LINE_CHANNEL_ID = '2010062826'
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
      const firebaseToken = await getAuth().createCustomToken(profile.userId)
      res.json({
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
      const firebaseToken = await getAuth().createCustomToken(claims.sub)
      res.json({
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

const round2 = (n) => Math.round(n * 100) / 100

// 把 map 的 from 鍵併入 to 鍵（金額相加）；沒有 from 時原樣回傳 null 表示不用改
const moveKey = (map, from, to) => {
  if (!map || !(from in map)) return null
  const next = { ...map }
  next[to] = round2((next[to] || 0) + next[from])
  delete next[from]
  return next
}

const swapId = (value, from, to) => (value === from ? to : value)

/**
 * 把群組內所有 fromId 的紀錄改成 toUid。先改子集合、最後才改群組文件，
 * 中途失敗時 fromId 仍留在 members，重試即可繼續（已改過的文件不會再被動到）。
 */
const migrateMember = async (groupId, fromId, toUid, profileOverride = {}) => {
  const db = getFirestore()
  const groupRef = db.doc(`groups/${groupId}`)
  const groupSnap = await groupRef.get()
  if (!groupSnap.exists) return false
  const group = groupSnap.data()
  if (!group.members?.includes(fromId)) return false

  const writer = db.bulkWriter()
  const [expenses, settlements] = await Promise.all([
    groupRef.collection('expenses').get(),
    groupRef.collection('settlements').get(),
  ])

  expenses.docs.forEach((d) => {
    const e = d.data()
    const patch = {}
    for (const field of ['payments', 'splits', 'shares']) {
      const moved = moveKey(e[field], fromId, toUid)
      if (moved) patch[field] = moved
    }
    if (e.createdBy === fromId) patch.createdBy = toUid
    if (Object.keys(patch).length) writer.update(d.ref, patch)
  })

  settlements.docs.forEach((d) => {
    const s = d.data()
    const patch = {}
    for (const field of ['from', 'to', 'settledBy']) {
      if (s[field] === fromId) patch[field] = toUid
    }
    if (Object.keys(patch).length) writer.update(d.ref, patch)
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
  if (group.createdBy === fromId) groupPatch.createdBy = toUid
  await groupRef.update(groupPatch)
  return true
}

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

// ---------- 匯出 CSV：LINE 內建瀏覽器無法下載 blob，改給一個短效網址在外部瀏覽器下載 ----------

const EXPORT_URL_TTL_MS = 5 * 60 * 1000
const MAX_CSV_CHARS = 1_000_000

/**
 * 把前端產生的 CSV 存到 Storage（exports/，由 bucket 的生命週期規則 1 天後清除），
 * 回傳 5 分鐘內有效的簽名網址，開啟即下載。需登入且是該群組成員（訪客也可）。
 * body { groupId, csv, filename }。簽名需要服務帳號有 Service Account Token Creator 權限（見 docs/operations.md）。
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

    const { groupId, csv, filename } = req.body || {}
    if (typeof csv !== 'string' || csv.length === 0 || csv.length > MAX_CSV_CHARS) {
      res.status(400).json({ error: 'invalid_csv' })
      return
    }

    try {
      const group = await readGroup(groupId)
      if (!group || !group.members.includes(caller.uid)) {
        res.status(403).json({ error: 'not_a_member' })
        return
      }

      // 檔名只留可見字元，去掉路徑與控制字元，一律以 .csv 結尾
      const base = String(filename || 'export').replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_').replace(/\.csv$/i, '').slice(0, 80) || 'export'
      const file = getStorage().bucket().file(`exports/${groupId}/${randomBytes(16).toString('hex')}.csv`)
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
 * 分享連結 /s/:groupId（及 /s/:groupId/add）：回傳 index.html，並依群組名稱與封面補上 og: 標籤，
 * 讓 LINE 等平台的連結預覽顯示該群組的封面。群組不存在時退回一般頁面。
 */
export const sharePage = onRequest(
  { cors: false, region: 'asia-east1', maxInstances: 5 },
  async (req, res) => {
    const groupId = req.path.match(/^\/s\/([A-Za-z0-9]{1,40})(?:\/add)?\/?$/)?.[1]
    try {
      let html = await loadIndexHtml()
      const group = groupId ? await readGroup(groupId) : null
      const title = group?.name ? `${group.name}｜貓咪分帳 CatSplit` : '貓咪分帳 CatSplit'
      const image = typeof group?.coverUrl === 'string' && group.coverUrl.startsWith('https://')
        ? group.coverUrl
        : `${SITE_ORIGIN}/apple-touch-icon.png`
      const tags = [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="貓咪分帳 CatSplit" />`,
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="分帳群組・點開進入記帳" />`,
        `<meta property="og:image" content="${escapeHtml(image)}" />`,
      ].join('\n    ')
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`).replace('</head>', `    ${tags}\n  </head>`)
      res.set('Cache-Control', 'public, max-age=0, s-maxage=60')
      res.type('html').send(html)
    } catch (e) {
      console.error('sharePage error', e)
      res.redirect(302, groupId ? `/group/${groupId}` : '/')
    }
  }
)
