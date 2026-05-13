import { createContext, useContext, useEffect, useState } from 'react'
import { initLiff } from '../config/liff'

const AppContext = createContext(null)

const LINE_CHANNEL_ID = '2010062826'
const STORAGE_KEY = 'catsplit_user'
const OAUTH_STATE_KEY = 'catsplit_oauth_state'
// localStorage 跨 redirect 保留，sessionStorage 在 LINE OAuth 跳轉後可能遺失
const stateStore = {
  set: (v) => localStorage.setItem(OAUTH_STATE_KEY, v),
  get: () => localStorage.getItem(OAUTH_STATE_KEY),
  remove: () => localStorage.removeItem(OAUTH_STATE_KEY),
}
const TOKEN_EXCHANGE_URL = import.meta.env.VITE_TOKEN_EXCHANGE_URL

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

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liffInstance, setLiffInstance] = useState(null)

  useEffect(() => {
    const init = async () => {
      let keepLoading = false
      try {
        // 本機開發模式
        if (import.meta.env.DEV) {
          setUser({
            uid: 'dev-user-001',
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

        // 1) 先從 localStorage 還原 session
        const cached = localStorage.getItem(STORAGE_KEY)
        if (cached) {
          try {
            setUser(JSON.parse(cached))
          } catch (e) {
            localStorage.removeItem(STORAGE_KEY)
          }
        }

        // 2) 嘗試 LIFF SDK
        try {
          const liff = await initLiff()
          setLiffInstance(liff)
          if (liff.isLoggedIn()) {
            const profile = await liff.getProfile()
            const u = {
              uid: profile.userId,
              name: profile.displayName,
              avatar: profile.pictureUrl,
            }
            setUser(u)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
          } else if (liff.isInClient()) {
            // 在 LINE 內建瀏覽器但未登入 → 自動觸發 LIFF 授權
            // 設 keepLoading=true 讓畫面維持載入中直到跳轉，避免閃出登入引導頁
            keepLoading = true
            liff.login()
            return
          }
        } catch (e) {
          console.warn('LIFF init 失敗，將改用 OAuth flow', e?.message || e)
        }
      } finally {
        if (!keepLoading) setLoading(false)
      }
    }

    init()
  }, [])

  const loginWithLine = () => {
    // LINE 內建瀏覽器：用 LIFF SDK login（才能在 LINE app 內正確授權）
    if (isInLineApp() && liffInstance) {
      liffInstance.login()
      return
    }
    // 外部瀏覽器：走標準 OAuth flow
    const state = generateState()
    stateStore.set(state)
    window.location.href = buildAuthorizeUrl(state)
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    if (liffInstance?.isLoggedIn()) liffInstance.logout()
    setUser(null)
  }

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
    <AppContext.Provider value={{ user, setUser, loading, loginWithLine, logout, completeOAuthCallback }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp 必須在 AppProvider 內使用')
  return context
}

export default AppContext
