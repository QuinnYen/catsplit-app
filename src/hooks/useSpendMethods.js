import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'

// 監聽我的付款方式清單（不含內建現金）；載入前為 null，依建立時間排序
const useSpendMethods = (uid) => {
  const [methods, setMethods] = useState(null)
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'spendMethods'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (a.createdAt?.toMillis?.() ?? Infinity) - (b.createdAt?.toMillis?.() ?? Infinity))
      setMethods(data)
    }, err => {
      console.error('Failed to load spend methods', err)
      setMethods([])
    })
  }, [uid])
  return methods
}

export default useSpendMethods
