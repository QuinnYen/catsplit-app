import { createContext, useContext, useEffect, useState } from 'react'
import { signInAnonymously, signInWithCustomToken, signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from '../config/firebase'
import { initLiff } from '../config/liff'
import { useI18n } from '../i18n/I18nProvider'

const AppContext = createContext(null)

const LINE_CHANNEL_ID = '2010062826'
const STORAGE_KEY = 'catsplit_user'
// 訪客選過的名字 [{ groupId, memberId, name }]，最新的在前；進入群組時自動切換成該群組的名字
const GUEST_NAMES_KEY = 'catsplit_guest_names'
export const MAX_GUEST_NAMES = 3
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

const postJson = (url, idToken, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(idToken && { Authorization: `Bearer ${idToken}` }) },
  body: JSON.stringify(body),
})

const requestClaim = async (idToken, groupId, placeholderId, avatar) => {
  const res = await postJson(CLAIM_MEMBER_URL, idToken, { groupId, placeholderId, avatar: avatar ?? null })
  if (!res.ok) throw new Error(`claim_failed: ${await res.text()}`)
}

// 以 LINE 身分登入 Firebase；若這個瀏覽器選過訪客名字，順便全部認領（綁定 LINE）。
// 認領失敗不會遺失資料：訪客名字仍在群組裡，之後可再從群組頁認領
const signInWithLineToken = async (firebaseToken, avatar) => {
  const guestNames = readGuestNames()
  const cred = await signInWithCustomToken(auth, firebaseToken)
  localStorage.removeItem(GUEST_NAMES_KEY)
  if (guestNames.length === 0) return
  const lineIdToken = await cred.user.getIdToken()
  for (const g of guestNames) {
    try {
      await requestClaim(lineIdToken, g.groupId, g.memberId, avatar)
    } catch (e) {
      console.error('綁定訪客名字失敗', g, e)
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

const isInLineApp = () => /Line/i.test(navigator.userAgent)

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
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liffInstance, setLiffInstance] = useState(null)
  const { applyAutoLanguage } = useI18n()

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
            name: '開發測試用戶',
            avatar: 'https://api.dicebear.com/7.x/adventurer/png?seed=Felix',
          })
          return
        }

        // 在 /auth/callback 路徑時，交給 callback 頁處理，不在這裡初始化
        // callback 頁會呼叫 completeOAuthCallback 設定 user，再 navigate 到 /
        if (window.location.pathname === '/auth/callback') {
          return  // finally 仍會執行，setLoading(false) 正常運作
        }

        // 1) 先嘗試 LIFF SDK（一定要等 init 完，避免後續頁面呼叫 liff.isInClient() 等 API 時 SDK 還沒準備好）
        try {
          const liff = await initLiff()
          setLiffInstance(liff)
          applyAutoLanguage(liff.getAppLanguage?.() ?? liff.getLanguage?.())
          if (liff.isLoggedIn()) {
            // 快速路徑：Firebase 已恢復同一個 LINE 使用者的登入（uid 即 LINE userId），
            // 就不用每次重跑 verifyLiffToken + signInWithCustomToken（約 1 秒以上）。
            // getDecodedIDToken 是同步的，用來確認目前 LIFF 使用者沒被換掉；
            // 有待認領的訪客名字時要走完整流程（認領在登入時進行）
            const cached = readCachedUser()
            await auth.authStateReady()
            const lineUid = liff.getDecodedIDToken()?.sub
            if (cached && lineUid && cached.uid === lineUid && auth.currentUser?.uid === lineUid
              && readGuestNames().length === 0) {
              setUser(cached)
              // 名字或頭像可能改過，背景更新即可
              liff.getProfile().then(p => {
                if (p.displayName === cached.name && p.pictureUrl === cached.avatar) return
                const u = { uid: p.userId, name: p.displayName, avatar: p.pictureUrl }
                setUser(u)
                localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
              }).catch(() => {})
              return
            }
            // getIDToken 是同步的，getProfile 與 verifyLiffToken 兩個請求可同時發出
            const idToken = liff.getIDToken()
            const verifying = idToken && VERIFY_LIFF_TOKEN_URL
              ? fetch(VERIFY_LIFF_TOKEN_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ idToken }),
                })
              : null
            const [profile, res] = await Promise.all([liff.getProfile(), verifying])
            if (res) {
              if (res.ok) {
                const data = await res.json()
                await signInWithLineToken(data.firebaseToken, profile.pictureUrl)
              } else {
                console.error('verifyLiffToken 失敗', await res.text())
              }
            }
            const u = {
              uid: profile.userId,
              name: profile.displayName,
              avatar: profile.pictureUrl,
            }
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
          console.warn('LIFF init 失敗，將改用 OAuth flow', e?.message || e)
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
    window.location.href = buildAuthorizeUrl(state)
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
      console.error('切換訪客名字失敗', e)
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
    if (!savedState || savedState !== state) {
      throw new Error(`state_mismatch: saved="${savedState}", received="${state}"`)
    }
    if (!TOKEN_EXCHANGE_URL) {
      throw new Error('token_exchange_url_not_configured')
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
    await signInWithLineToken(data.firebaseToken, data.pictureUrl)
    const u = {
      uid: data.userId,
      name: data.displayName,
      avatar: data.pictureUrl,
    }
    setUser(u)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    return u
  }

  return (
    <AppContext.Provider value={{ user, setUser, loading, loginWithLine, loginAsGuest, joinAsGuest, forgetGuestName, switchGuestGroup, guestNames: user?.guest ? readGuestNames() : [], claimMember, logout, completeOAuthCallback, liffInstance }}>
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp 必須在 AppProvider 內使用')
  return context
}

export default AppContext
