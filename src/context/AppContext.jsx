import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { signInAnonymously, signInWithCustomToken, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { auth, db } from '../config/firebase'
import { initLiff } from '../config/liff'
import { useI18n } from '../i18n/I18nProvider'
import {
  uidFromLoginResponse, buildSessionUser, canReuseCachedSession, isLineUserAgent, needsNicknameSetup,
} from '../utils/authSession'
import identityApi from '../utils/identityApi'

const AppContext = createContext(null)

const LINE_CHANNEL_ID = '2010062826'
const STORAGE_KEY = 'catsplit_user'
// 訪客選過的名字 [{ groupId, memberId, name }]，最新的在前；進入群組時自動切換成該群組的名字
const GUEST_NAMES_KEY = 'catsplit_guest_names'
export const MAX_GUEST_NAMES = 3
export const NICKNAME_MAX_LENGTH = 20
// 全域暱稱（LINE 使用者自訂的顯示名稱）存在 users/{uid}/settings/profile，localStorage 只當快取，讓啟動時不用等網路
const nicknameCacheKey = (uid) => `catsplit_nickname_${uid}`
const nicknameRef = (uid) => doc(db, 'users', uid, 'settings', 'profile')
const readGuestNames = () => {
  try {
    const list = JSON.parse(localStorage.getItem(GUEST_NAMES_KEY))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
const writeGuestNames = (list) => localStorage.setItem(GUEST_NAMES_KEY, JSON.stringify(list))
const OAUTH_STATE_KEY = 'catsplit_oauth_state'
// LINE 授權的用途：'bind' 代表是在設定頁綁定 LINE（回來後呼叫 bindIdentity），沒有就是一般登入
const OAUTH_PURPOSE_KEY = 'catsplit_oauth_purpose'
// localStorage 跨 redirect 保留，sessionStorage 在 LINE OAuth 跳轉後可能遺失
const stateStore = {
  set: (v) => localStorage.setItem(OAUTH_STATE_KEY, v),
  get: () => localStorage.getItem(OAUTH_STATE_KEY),
  remove: () => localStorage.removeItem(OAUTH_STATE_KEY),
}
const TOKEN_EXCHANGE_URL = import.meta.env.VITE_TOKEN_EXCHANGE_URL
const VERIFY_LIFF_TOKEN_URL = TOKEN_EXCHANGE_URL?.replace('/lineLogin', '/verifyLiffToken')
const CLAIM_MEMBER_URL = TOKEN_EXCHANGE_URL?.replace('/lineLogin', '/claimMember')
const GUEST_LOGIN_URL = TOKEN_EXCHANGE_URL?.replace('/lineLogin', '/guestLogin')
const AUTH_EXCHANGE_URL = TOKEN_EXCHANGE_URL?.replace('/lineLogin', '/authExchange')

const postJson = (url, idToken, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(idToken && { Authorization: `Bearer ${idToken}` }) },
  body: JSON.stringify(body),
})

const requestClaim = async (idToken, groupId, placeholderId, avatar) => {
  const res = await postJson(CLAIM_MEMBER_URL, idToken, { groupId, placeholderId, avatar: avatar ?? null })
  if (!res.ok) throw new Error(`claim_failed: ${await res.text()}`)
}

// 用雲端函式換發的 custom token 登入 Firebase（LINE、之後的 Google 共用）；
// 若這個瀏覽器選過訪客名字，順便全部認領（綁定身分）。
// 認領失敗不會遺失資料：訪客名字仍在群組裡，之後可再從群組頁認領
const signInWithExchangeToken = async (firebaseToken, avatar) => {
  const guestNames = readGuestNames()
  const cred = await signInWithCustomToken(auth, firebaseToken)
  localStorage.removeItem(GUEST_NAMES_KEY)
  if (guestNames.length === 0) return
  const lineIdToken = await cred.user.getIdToken()
  for (const g of guestNames) {
    try {
      await requestClaim(lineIdToken, g.groupId, g.memberId, avatar)
    } catch (e) {
      console.error('Failed to bind guest name', g, e)
    }
  }
}

// 取得群組的訪客名字清單（不需登入，持有群組連結即可）
// eslint-disable-next-line react-refresh/only-export-components
export const fetchGuestList = async (groupId) => {
  const res = await postJson(GUEST_LOGIN_URL, null, { groupId })
  if (!res.ok) throw new Error(`guest_list_failed: ${res.status}`)
  return res.json()
}

const buildRedirectUri = () => `${window.location.origin}/auth/callback`

const buildAuthorizeUrl = (state) => {
  const base = 'https://access.line.me/oauth2/v2.1/authorize'
  const params = [
    `response_type=code`,
    `client_id=${LINE_CHANNEL_ID}`,
    `redirect_uri=${encodeURIComponent(buildRedirectUri())}`,
    `state=${state}`,
    `scope=profile%20openid`,
  ].join('&')
  return `${base}?${params}`
}

const generateState = () => {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

const isInLineApp = () => isLineUserAgent(navigator.userAgent)

// 邀請連結（群組首頁）；liff.state 已在 main.jsx 換成真正的路徑
const isInvitePath = () => /^\/group\/[^/]+(?:\/add)?\/?$/.test(window.location.pathname)

const readCachedUser = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export const AppProvider = ({ children }) => {
  const [baseUser, setUser] = useState(null)
  // 雲端讀到的暱稱 { uid, value }；讀到之前先用 localStorage 快取
  const [fetchedNickname, setFetchedNickname] = useState(null)
  // 讀取暱稱失敗（例如離線）的 uid；Google 使用者等暱稱時用它避免永遠停在載入畫面
  const [nicknameFailedUid, setNicknameFailedUid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liffInstance, setLiffInstance] = useState(null)
  const { applyAutoLanguage } = useI18n()

  const baseUid = baseUser?.uid
  const baseIsGuest = !!baseUser?.guest
  const cachedNickname = useMemo(() => {
    if (!baseUid || baseIsGuest) return null
    try { return localStorage.getItem(nicknameCacheKey(baseUid)) || null } catch { return null }
  }, [baseUid, baseIsGuest])
  const fetchedForMe = !!baseUid && !baseIsGuest && fetchedNickname?.uid === baseUid
  const nickname = !baseUid || baseIsGuest ? null : (fetchedForMe ? fetchedNickname.value : cachedNickname)
  // 暱稱已從雲端確認過（成功讀到）才為 true；同步名字到群組前要等它，否則會先用 LINE 名字蓋掉暱稱
  const nicknameReady = fetchedForMe
  // Google 帳號沒有 LINE 名字可當預設：還沒有暱稱時要先到設定暱稱頁；雲端暱稱還沒讀完時先等（不能先進首頁）
  const needsNickname = needsNicknameSetup({ provider: baseUser?.provider, isGuest: baseIsGuest, nicknameReady, nickname })
  const nicknameLoading = !!baseUid && !baseIsGuest && baseUser?.provider === 'google'
    && !nicknameReady && nicknameFailedUid !== baseUid

  // 對外的 user：有暱稱就以暱稱當 name（LINE 原名在 lineName）
  const user = useMemo(
    () => (baseUser && nickname ? { ...baseUser, name: nickname, lineName: baseUser.name } : baseUser),
    [baseUser, nickname]
  )

  const writeNicknameCache = (uid, value) => {
    try { value ? localStorage.setItem(nicknameCacheKey(uid), value) : localStorage.removeItem(nicknameCacheKey(uid)) } catch { /* 存不了就不快取 */ }
  }

  useEffect(() => {
    if (!baseUid || baseIsGuest) return
    let cancelled = false
    auth.authStateReady()
      .then(() => getDoc(nicknameRef(baseUid)))
      .then((snap) => {
        if (cancelled) return
        const value = snap.data()?.nickname || null
        writeNicknameCache(baseUid, value)
        setFetchedNickname({ uid: baseUid, value })
      })
      .catch((e) => {
        console.warn('load nickname failed', e?.code || e)
        if (!cancelled) setNicknameFailedUid(baseUid)
      })
    return () => { cancelled = true }
  }, [baseUid, baseIsGuest])

  // 空字串代表清除暱稱、回到 LINE 名字；Google 帳號沒有 LINE 名字可退回，暱稱不能留空
  const saveNickname = async (value) => {
    const trimmed = value.trim().slice(0, NICKNAME_MAX_LENGTH)
    if (!trimmed && baseUser?.provider === 'google') throw new Error('nickname_required')
    if (trimmed) await setDoc(nicknameRef(baseUid), { nickname: trimmed })
    else await deleteDoc(nicknameRef(baseUid))
    writeNicknameCache(baseUid, trimmed || null)
    setFetchedNickname({ uid: baseUid, value: trimmed || null })
  }

  useEffect(() => {
    const init = async () => {
      let keepLoading = false
      try {
        // 本機開發模式
        if (import.meta.env.DEV) {
          // 在 Auth Emulator 匿名登入，uid 才會通過 Firestore rules
          await auth.authStateReady()
          const { user: devUser } = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth)
          setUser({
            uid: devUser.uid,
            name: 'Dev Test User',
            avatar: 'https://api.dicebear.com/7.x/adventurer/png?seed=Felix',
          })
          return
        }

        // 在 /auth/callback 路徑時，交給 callback 頁處理，不在這裡初始化
        // callback 頁會呼叫 completeOAuthCallback 設定 user，再 navigate 到 /
        if (window.location.pathname === '/auth/callback') {
          return  // finally 仍會執行，setLoading(false) 正常運作
        }

        // 沒有快取使用者代表會走完整流程：先對 verifyLiffToken 發一個 GET 把 Function 喚醒，
        // 冷啟動（約 3 秒）就和 liff.init 同時進行。no-cors：只要請求送達，不需要讀回應（回 405 即可）
        if (VERIFY_LIFF_TOKEN_URL && !readCachedUser()) {
          fetch(VERIFY_LIFF_TOKEN_URL, { mode: 'no-cors' }).catch(() => {})
        }

        // 1) 先嘗試 LIFF SDK（一定要等 init 完，避免後續頁面呼叫 liff.isInClient() 等 API 時 SDK 還沒準備好）
        try {
          const liff = await initLiff()
          setLiffInstance(liff)
          applyAutoLanguage(liff.getAppLanguage?.() ?? liff.getLanguage?.())
          if (liff.isLoggedIn()) {
            // 快速路徑：Firebase 已恢復同一個使用者的登入，
            // 就不用每次重跑 verifyLiffToken + signInWithCustomToken（約 1 秒以上）。
            // getDecodedIDToken 是同步的，用來確認目前 LIFF 使用者沒被換掉（比對快取記的 LINE userId）；
            // uid 與 LINE userId 是兩回事，uid 以 Firebase 登入的為準（判斷見 utils/authSession.js）；
            // 有待認領的訪客名字時要走完整流程（認領在登入時進行）
            const cached = readCachedUser()
            await auth.authStateReady()
            const lineSub = liff.getDecodedIDToken()?.sub
            if (canReuseCachedSession({
              cached, firebaseUid: auth.currentUser?.uid, lineSub, hasPendingGuestNames: readGuestNames().length > 0,
            })) {
              setUser(cached)
              // 名字或頭像可能改過，背景更新即可；舊版快取沒有 lineUserId，順便補上
              liff.getProfile().then(p => {
                if (cached.lineUserId && p.displayName === cached.name && p.pictureUrl === cached.avatar) return
                const u = buildSessionUser({ uid: cached.uid, lineUserId: p.userId, name: p.displayName, avatar: p.pictureUrl })
                setUser(u)
                localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
              }).catch(() => {})
              return
            }
            // getIDToken 是同步的，getProfile 與 verifyLiffToken 兩個請求可同時發出
            const idToken = liff.getIDToken()
            // 逾時（含冷啟動約 4 秒的餘裕）就丟錯，改走下方的備援流程，不會一直卡在載入畫面
            const verifying = idToken && VERIFY_LIFF_TOKEN_URL
              ? fetch(VERIFY_LIFF_TOKEN_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ idToken }),
                  signal: AbortSignal.timeout(15000),
                })
              : null
            const [profile, res] = await Promise.all([liff.getProfile(), verifying])
            // 登入成功時 uid 以伺服器回傳為準；失敗時（沒登入 Firebase）退回 LINE userId，與過去行為相同
            let uid = profile.userId
            if (res) {
              if (res.ok) {
                const data = await res.json()
                uid = uidFromLoginResponse(data)
                await signInWithExchangeToken(data.firebaseToken, profile.pictureUrl)
              } else {
                console.error('verifyLiffToken failed', await res.text())
              }
            }
            const u = buildSessionUser({
              uid,
              lineUserId: profile.userId,
              name: profile.displayName,
              avatar: profile.pictureUrl,
            })
            setUser(u)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
            return
          }
          // 在 LINE 內建瀏覽器但未登入 → 自動觸發 LIFF 授權。
          // 例外：邀請連結要讓使用者選 LINE 或訪客；已是訪客的人也不強迫登入 LINE
          if (liff.isInClient() && !isInvitePath() && !readCachedUser()?.guest) {
            keepLoading = true
            const currentPath = window.location.pathname + window.location.search
            liff.login({ redirectUri: `${window.location.origin}${currentPath}` })
            return
          }
        } catch (e) {
          console.warn('LIFF init failed, falling back to OAuth flow', e?.message || e)
        }

        // 2) LIFF 沒拿到使用者（外部瀏覽器或 LIFF init 失敗）→ 從 localStorage 還原 session
        const cached = localStorage.getItem(STORAGE_KEY)
        if (cached) {
          try {
            setUser(JSON.parse(cached))
          } catch {
            localStorage.removeItem(STORAGE_KEY)
          }
          // 等 Firebase Auth 自動恢復登入狀態完成，避免頁面在 request.auth 還是
          // null 時就發出 Firestore 查詢而被規則拒絕
          keepLoading = true
          const unsubscribe = onAuthStateChanged(auth, () => {
            unsubscribe()
            setLoading(false)
          })
          return
        }
      } finally {
        if (!keepLoading) setLoading(false)
      }
    }

    init()
  }, [applyAutoLanguage])

  const loginWithLine = (redirectPath) => {
    if (redirectPath) localStorage.setItem('catsplit_redirect', redirectPath)
    // LINE 內建瀏覽器：用 LIFF SDK login（才能在 LINE app 內正確授權）
    if (isInLineApp() && liffInstance) {
      const target = redirectPath || (window.location.pathname + window.location.search)
      liffInstance.login({ redirectUri: `${window.location.origin}${target}` })
      return
    }
    // 外部瀏覽器：走標準 OAuth flow
    const state = generateState()
    stateStore.set(state)
    localStorage.removeItem(OAUTH_PURPOSE_KEY)
    window.location.href = buildAuthorizeUrl(state)
  }

  // 設定頁綁定 LINE（只在外部瀏覽器：LINE 內建瀏覽器登入的就是 LINE，沒有可綁的）。
  // 跳到 LINE 授權後回到 /auth/callback，由 completeOAuthCallback 依用途呼叫 bindIdentity
  const startLineBind = () => {
    const state = generateState()
    stateStore.set(state)
    localStorage.setItem(OAUTH_PURPOSE_KEY, 'bind')
    window.location.href = buildAuthorizeUrl(state)
  }

  const getIdToken = () => auth.currentUser?.getIdToken()

  // 合併完成後：若原本的登入帳號被併入而刪除（sessionReplaced），用回傳的 token 重新登入保留帳號並重建本機的使用者資料，
  // 再整頁重新載入，讓所有狀態（暱稱、群組…）都以合併後的帳號為準
  const completeMerge = async ({ sessionReplaced, firebaseToken, profile }) => {
    if (sessionReplaced) {
      await signInWithCustomToken(auth, firebaseToken)
      const uid = auth.currentUser.uid
      const isGoogle = profile?.provider === 'google'
      const u = buildSessionUser({
        uid,
        lineUserId: /^U[0-9a-f]{32}$/.test(uid) ? uid : undefined,
        name: profile?.name ?? '',
        avatar: typeof profile?.avatar === 'string' ? profile.avatar : null,
        provider: isGoogle ? 'google' : undefined,
      })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    }
    window.location.assign('/settings?merged=1')
  }

  // Google 登入：credential 是 Google Identity Services 給的 ID token，交給 authExchange 驗證並換成內部 uid 的 custom token。
  // Google 帳號沒有頭像（avatar 為 null，畫面顯示名字首字）；名字只是預設，首次登入要先設定暱稱（見 needsNickname）
  const loginWithGoogle = async (credential) => {
    if (!AUTH_EXCHANGE_URL) throw new Error('token_exchange_url_not_configured')
    const res = await postJson(AUTH_EXCHANGE_URL, null, { provider: 'google', idToken: credential })
    if (!res.ok) throw new Error(`auth_exchange_failed_${res.status}`)
    const data = await res.json()
    await signInWithExchangeToken(data.firebaseToken, null)
    const u = buildSessionUser({ uid: data.uid, name: data.displayName, avatar: null, provider: 'google' })
    setUser(u)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    return u
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(GUEST_NAMES_KEY)
    if (liffInstance?.isLoggedIn()) liffInstance.logout()
    signOut(auth).catch(() => {})
    setUser(null)
  }

  // 不登入 LINE，以訪客名字使用（uid 即該名字的成員 id，同一時間只代表一個群組）。
  // body 為 { memberId }（選既有名字）或 { name }（自己輸入新名字）。
  // 最多記住 MAX_GUEST_NAMES 個群組的名字，超過要用 LINE 登入（丟出 guest_limit）；
  // 其他失敗丟出 functions 回傳的錯誤碼（name_taken、group_full、guest_not_found…）
  const guestSignIn = async (groupId, body) => {
    const others = readGuestNames().filter(g => g.groupId !== groupId)
    if (others.length >= MAX_GUEST_NAMES) throw new Error('guest_limit')
    const res = await postJson(GUEST_LOGIN_URL, null, { groupId, ...body })
    if (!res.ok) {
      // 名字已被認領或移除，從記錄中拿掉
      if (res.status === 404) writeGuestNames(others)
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `guest_login_failed_${res.status}`)
    }
    const data = await res.json()
    await signInWithCustomToken(auth, data.firebaseToken)
    writeGuestNames([{ groupId, memberId: data.memberId, name: data.name }, ...others])
    const u = { uid: data.memberId, name: data.name, avatar: null, guest: true, groupId }
    setUser(u)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    return u
  }
  const loginAsGuest = (groupId, memberId) => guestSignIn(groupId, { memberId })
  const joinAsGuest = (groupId, name) => guestSignIn(groupId, { name: name.trim() })

  // 訪客選錯名字：只忘掉這個群組的名字並登出，回到邀請畫面重選；其他群組的名字保留
  const forgetGuestName = (groupId) => {
    writeGuestNames(readGuestNames().filter(g => g.groupId !== groupId))
    localStorage.removeItem(STORAGE_KEY)
    signOut(auth).catch(() => {})
    setUser(null)
  }

  // 訪客進入另一個選過名字的群組時，自動切換成該群組的名字。
  // 失敗時（名字已被認領、移除或網路錯誤）忘掉這筆，讓群組頁顯示名單重新選
  const switchGuestGroup = async (groupId) => {
    const entry = readGuestNames().find(g => g.groupId === groupId)
    if (!entry) return
    try {
      await loginAsGuest(entry.groupId, entry.memberId)
    } catch (e) {
      console.error('Failed to switch guest name', e)
      writeGuestNames(readGuestNames().filter(g => g.groupId !== groupId))
      setUser(prev => ({ ...prev }))
    }
  }

  // LINE 使用者認領訪客名字，成功後自己就成為該群組成員，這個名字之後只有本人能用
  const claimMember = async (groupId, placeholderId) =>
    requestClaim(await auth.currentUser.getIdToken(), groupId, placeholderId, user.avatar)

  const completeOAuthCallback = async ({ code, state }) => {
    const savedState = stateStore.get()
    stateStore.remove()
    const purpose = localStorage.getItem(OAUTH_PURPOSE_KEY)
    localStorage.removeItem(OAUTH_PURPOSE_KEY)
    if (!savedState || savedState !== state) {
      throw new Error(`state_mismatch: saved="${savedState}", received="${state}"`)
    }
    if (!TOKEN_EXCHANGE_URL) {
      throw new Error('token_exchange_url_not_configured')
    }

    // 綁定 LINE：這個頁面一開始就跳過了使用者初始化（見 init），所以要自己確認目前有登入，
    // 用目前的 Firebase 登入加上這次的 LINE 授權碼呼叫 bindIdentity，並把原本的使用者放回狀態
    if (purpose === 'bind') {
      await auth.authStateReady()
      const cached = readCachedUser()
      if (!auth.currentUser || !cached || cached.guest) throw new Error('bind_session_missing')
      const result = await identityApi.bindIdentity(await auth.currentUser.getIdToken(), {
        provider: 'line', code, redirectUri: buildRedirectUri(),
      })
      setUser(cached)
      return { purpose: 'bind', result }
    }

    const res = await fetch(TOKEN_EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri: buildRedirectUri() }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`token_exchange_failed: ${text}`)
    }

    const data = await res.json()
    await signInWithExchangeToken(data.firebaseToken, data.pictureUrl)
    const u = buildSessionUser({
      uid: uidFromLoginResponse(data),
      lineUserId: data.userId,
      name: data.displayName,
      avatar: data.pictureUrl,
    })
    setUser(u)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    return u
  }

  return (
    <AppContext.Provider value={{ user, setUser, nicknameReady, needsNickname, nicknameLoading, saveNickname, loading, loginWithLine, loginWithGoogle, startLineBind, getIdToken, completeMerge, loginAsGuest, joinAsGuest, forgetGuestName, switchGuestGroup, guestNames: user?.guest ? readGuestNames() : [], claimMember, logout, completeOAuthCallback, liffInstance }}>
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}

export default AppContext
