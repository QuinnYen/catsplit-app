// 手機的「上一頁」（返回鍵、側滑返回）關閉彈出頁，而不是去控制背景的頁面。
// 彈出頁打開時多推一筆瀏覽記錄；使用者按返回就退掉這一筆，我們趁機把彈出頁關掉，背景頁面不動。
// 彈出頁是用按鈕（X、儲存）關的，就把多推的那一筆拿掉，不然返回要多按一次。
// 多層彈出頁（記帳面板裡再開幣別選單）各自推一筆，返回時由內往外一層一層關。
// 彈出頁關閉的同時如果馬上換頁（navigate），當下最上面那一筆已不是我們的，就不處理（換頁時請用 replace 蓋掉它）。
import { useEffect, useRef } from 'react'

export const useBackClose = (onClose) => {
  const closeRef = useRef(onClose)
  const marker = useRef(null)
  const alive = useRef(false)
  const popped = useRef(false)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    alive.current = true
    // StrictMode 開發時 effect 會跑兩次：marker 存在 ref 裡，第二次不重複推
    if (!marker.current) {
      marker.current = `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      window.history.pushState({ ...window.history.state, backSheet: marker.current }, '')
    }
    const onPop = () => {
      // 回到我們這一筆（例如上層關閉了內層）不算離開
      if (window.history.state?.backSheet === marker.current) return
      popped.current = true
      closeRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      alive.current = false
      window.removeEventListener('popstate', onPop)
      // 晚一個 tick 再判斷：StrictMode 的假卸載會馬上重新掛載
      setTimeout(() => {
        if (alive.current || popped.current) return
        if (window.history.state?.backSheet === marker.current) window.history.back()
      }, 0)
    }
  }, [])
}
