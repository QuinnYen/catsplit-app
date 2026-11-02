import { useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../config/firebase'
import { useApp } from '../context/AppContext'

// 在 LINE 內建瀏覽器進首頁時，對還不是官方帳號好友的使用者跳一次加好友提示。
// 旗標存在 Firestore（users/{uid}/settings/oaPrompt），清掉瀏覽器資料或換裝置也不會再跳；
// 先寫旗標再跳提示，所以不論使用者加不加，都只會被問這一次。
// 授權畫面的加好友選項只在第一次授權出現，已授權的使用者靠這裡補上
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
      if ((await getDoc(ref)).exists() || cancelled) return
      await setDoc(ref, { promptedAt: serverTimestamp() })
      if (cancelled) return
      const { friendFlag } = await liffInstance.getFriendship()
      alert(`[TEMP DEBUG] friendFlag=${friendFlag} (type ${typeof friendFlag})`) // TEMP DEBUG：測完要移除
      if (!friendFlag && !cancelled) {
        await liffInstance.requestFriendship()
        const after = await liffInstance.getFriendship() // TEMP DEBUG：測完要移除
        alert(`[TEMP DEBUG] requestFriendship resolved, friendFlag now=${after.friendFlag}`) // TEMP DEBUG: remove after testing
      }
    }
    run().catch((e) => {
      console.warn('official account prompt failed', e?.code || e?.message || e)
      alert(`[TEMP DEBUG] error: ${e?.code || ''} ${e?.message || e}`) // TEMP DEBUG：測完要移除
    })
    return () => { cancelled = true }
  }, [uid, isGuest, liffInstance])
}

export default useOfficialAccountPrompt
