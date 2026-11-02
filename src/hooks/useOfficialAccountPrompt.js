import { useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../config/firebase'
import { useApp } from '../context/AppContext'

// 在 LINE 內建瀏覽器進 App 時（不論從哪個頁面進來），對還不是官方帳號好友的使用者跳加好友提示，每 30 天最多一次。
// 在 App.jsx 的 ProtectedRoutes 掛載一次；「不是好友」也包含封鎖或刪除過官方帳號的人（LINE 會改問解除封鎖）。
// 上次檢查時間存在 Firestore（users/{uid}/settings/oaPrompt），清掉瀏覽器資料或換裝置也不受影響；
// 先寫時間再檢查，所以好友與非好友都是 30 天才檢查一次，不會每次開 App 都呼叫 LIFF。
// 授權畫面的加好友選項只在第一次授權出現，已授權的使用者靠這裡補上
const PROMPT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

const useOfficialAccountPrompt = () => {
  const { user, liffInstance } = useApp()
  const uid = user?.uid
  const isGuest = !!user?.guest

  useEffect(() => {
    if (!uid || isGuest || !liffInstance?.isInClient()) return
    let cancelled = false
    const run = async () => {
      await auth.authStateReady()
      const ref = doc(db, 'users', uid, 'settings', 'oaPrompt')
      const last = (await getDoc(ref)).data()?.promptedAt?.toMillis?.() ?? 0
      if (Date.now() - last < PROMPT_INTERVAL_MS || cancelled) return
      await setDoc(ref, { promptedAt: serverTimestamp() })
      if (cancelled) return
      const { friendFlag } = await liffInstance.getFriendship()
      if (!friendFlag && !cancelled) await liffInstance.requestFriendship()
    }
    run().catch((e) => console.warn('official account prompt failed', e?.code || e?.message || e))
    return () => { cancelled = true }
  }, [uid, isGuest, liffInstance])
}

export default useOfficialAccountPrompt
