import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './context/AppContext'
import App from './App.jsx'
import './index.css'
import { BootTrace, mark } from './utils/bootTrace'

mark('main.jsx 開始執行（含 HTML+JS 下載）')

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
    <BootTrace />
  </StrictMode>,
)
