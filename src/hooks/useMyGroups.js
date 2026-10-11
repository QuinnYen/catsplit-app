// 目前使用者的群組清單（首頁與桌機側欄共用；自 HomePage 原樣搬出）
// 一般使用者：即時訂閱 members 含自己的群組；訪客：列出這個瀏覽器選過名字的群組（每個群組的「我」是各自的訪客名字 id）
import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, onSnapshot, getDoc, doc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'

// 首頁與側欄用同一個函式建構查詢，兩者相等，Firestore SDK 共用同一個 watch target
export const myGroupsQuery = (uid) => query(
  collection(db, 'groups'),
  where('members', 'array-contains', uid),
  orderBy('createdAt', 'desc')
)

const useMyGroups = () => {
  const { user, loading: authLoading, guestNames } = useApp()
  const [groups, setGroups] = useState([])
  const [groupsLoaded, setGroupsLoaded] = useState(false)

  const guestKey = user?.guest ? guestNames.map(g => `${g.groupId}:${g.memberId}`).join(',') : ''

  useEffect(() => {
    if (authLoading || !guestKey) return
    let cancelled = false
    const entries = guestKey.split(',').map(e => e.split(':'))
    Promise.all(entries.map(([gid]) => getDoc(doc(db, 'groups', gid)).catch(() => null)))
      .then(snaps => {
        if (cancelled) return
        // 名字已被認領或移除的群組不顯示
        const data = snaps
          .map((snap, i) => snap?.exists() && snap.data().members?.includes(entries[i][1]) ? { id: snap.id, ...snap.data() } : null)
          .filter(Boolean)
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        setGroups(data)
        setGroupsLoaded(true)
      })
    return () => { cancelled = true }
  }, [guestKey, authLoading])

  useEffect(() => {
    if (authLoading) return
    if (!user || user.guest) return
    const q = myGroupsQuery(user.uid)
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setGroups(data)
      setGroupsLoaded(true)
    }, (error) => {
      console.error('Failed to load groups:', error)
      setGroupsLoaded(true)
    })
    return () => unsubscribe()
  }, [user, authLoading])

  return { groups, groupsLoaded }
}

export default useMyGroups
