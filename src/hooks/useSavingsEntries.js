import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'

// 監聽某個儲蓄目標的存提款紀錄；載入前為 null，不排序
const useSavingsEntries = (uid, goalId) => {
  const [entries, setEntries] = useState(null)
  useEffect(() => {
    return onSnapshot(collection(db, 'users', uid, 'savingsGoals', goalId, 'entries'), snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, err => {
      console.error('Failed to load savings entries', err)
      setEntries([])
    })
  }, [uid, goalId])
  return entries
}

export default useSavingsEntries
