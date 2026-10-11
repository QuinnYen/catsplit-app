// 桌機外殼（側欄）是否顯示；字串與 src/index.css 的 @media (min-width: 1024px) 相同，兩邊在同一寬度切換
import { useEffect, useState } from 'react'

export const DESKTOP_MQ = '(min-width: 1024px)'

const useIsDesktop = () => {
  // 初值同步取得，避免第一次渲染先閃一下手機版
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_MQ).matches)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ)
    const onChange = () => setIsDesktop(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}

export default useIsDesktop
