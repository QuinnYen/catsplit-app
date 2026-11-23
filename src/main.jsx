import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './theme/ThemeProvider'
import { I18nProvider } from './i18n/I18nProvider'
import { AppProvider } from './context/AppContext'
import App from './App.jsx'
import './index.css'

// 從 liff.line.me/{liffId}/group/xxx 開啟時會先落在 /?liff.state=%2Fgroup%2Fxxx；
// LIFF 在外部瀏覽器未登入時不會自動轉過去，這裡先換成真正的路徑，讓路由與邀請畫面判斷正確
const params = new URLSearchParams(window.location.search)
const liffState = params.get('liff.state')
if (window.location.pathname === '/' && liffState?.startsWith('/') && !liffState.startsWith('//')) {
  params.delete('liff.state')
  const [path, query = ''] = liffState.split('?')
  const merged = new URLSearchParams(query)
  params.forEach((v, k) => merged.set(k, v))
  const qs = merged.toString()
  window.history.replaceState(null, '', path + (qs ? `?${qs}` : '') + window.location.hash)
}

// 註冊最小的 Service Worker（public/sw.js），讓網站可以安裝到主畫面；只在正式環境，失敗不影響使用
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('service worker register failed', e))
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
