import { createContext, useContext, useEffect, useState } from 'react'
import { initLiff } from '../config/liff'

const AppContext = createContext(null)

const LINE_CHANNEL_ID = '2010062826'
const STORAGE_KEY = 'catsplit_user'
const OAUTH_STATE_KEY = 'catsplit_oauth_state'
const TOKEN_EXCHANGE_URL = import.meta.env.VITE_TOKEN_EXCHANGE_URL

const buildRedirectUri = () => `${window.location.origin}/auth/callback`

const buildAuthorizeUrl = (state) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_CHANNEL_ID,
    redirect_uri: buildRedirectUri(),
    state,
    scope: 'profile openid',
  })
  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`
}

const generateState = () => {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
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
        if (window.location.pathname === '/auth/callback') {
          return
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

        // 2) 嘗試 LIFF SDK（LINE 內建瀏覽器最順）
        try {
          const liff = await initLiff()
          if (liff.isLoggedIn()) {
            const profile = await liff.getProfile()
            const u = {
              uid: profile.userId,
              name: profile.displayName,
              avatar: profile.pictureUrl,
            }
            setUser(u)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
          }
        } catch (e) {
          // LIFF 失敗無所謂，外部瀏覽器/被擋 CDN 的使用者走登入按鈕的 OAuth flow
          console.warn('LIFF init 失敗，將改用 OAuth flow', e?.message || e)
        }
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  const loginWithLine = () => {
    const state = generateState()
    sessionStorage.setItem(OAUTH_STATE_KEY, state)
    window.location.href = buildAuthorizeUrl(state)
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }

  const completeOAuthCallback = async ({ code, state }) => {
    const savedState = sessionStorage.getItem(OAUTH_STATE_KEY)
    sessionStorage.removeItem(OAUTH_STATE_KEY)
    if (!savedState || savedState !== state) {
      throw new Error('state_mismatch')
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
