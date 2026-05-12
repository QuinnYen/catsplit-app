import { createContext, useContext, useEffect, useState } from 'react'
import { initLiff } from '../config/liff'

const AppContext = createContext(null)

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        // 本機開發模式，跳過 LIFF
        if (import.meta.env.DEV) {
          setUser({
            uid: 'dev-user-001',
            name: '開發測試用戶',
            avatar: 'https://api.dicebear.com/7.x/adventurer/png?seed=Felix',
          })
          return
        }

        const liff = await initLiff()

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile()
          setUser({
            uid: profile.userId,
            name: profile.displayName,
            avatar: profile.pictureUrl,
          })
        } else {
          liff.login()
        }
      } catch (error) {
        console.error('初始化失敗', error)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  return (
    <AppContext.Provider value={{ user, setUser, loading }}>
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
