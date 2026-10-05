// 臨時診斷：網址帶 ?debug=1 後（會記在 localStorage）顯示啟動各階段耗時。查完請移除。
import { useEffect, useState } from 'react'

const FLAG = 'catsplit_debug'
if (new URLSearchParams(window.location.search).get('debug') === '1') localStorage.setItem(FLAG, '1')
if (new URLSearchParams(window.location.search).get('debug') === '0') localStorage.removeItem(FLAG)

// performance.now() 從頁面開始導航起算，所以第一個點已包含 HTML 與 JS 下載時間
const marks = []
// eslint-disable-next-line react-refresh/only-export-components
export const mark =(label) => marks.push([label, Math.round(performance.now())])

export const BootTrace = () => {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 500)
    return () => clearInterval(t)
  }, [])
  if (localStorage.getItem(FLAG) !== '1') return null
  return (
    <pre style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999, margin: 0, padding: 8, fontSize: 11, background: 'rgba(0,0,0,0.8)', color: '#0f0', pointerEvents: 'none' }}>
      {marks.map(([l, t]) => `${String(t).padStart(5)} ms  ${l}`).join('\n')}
    </pre>
  )
}
