// 把 LINE 的頭像、名字同步到自己所在群組的 memberProfiles（群組裡存的是加入當下的副本，不會自己更新）。
// 頭像：和群組裡的不同就更新。
// 名字：成員可能在群組內改過暱稱，所以只在「LINE 名字相對上次記錄有變」時才覆蓋；第一次只記錄、不覆蓋。
import { useEffect, useRef } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'

const nameMarkerKey = (uid) => `catsplit_synced_name_${uid}`

const useSyncMemberProfile = (groups, groupsLoaded) => {
  const { user } = useApp()
  const attempted = useRef(new Set())

  useEffect(() => {
    if (!user || user.guest || !groupsLoaded || !user.name) return
    const uid = user.uid
    const avatar = typeof user.avatar === 'string' && user.avatar.startsWith('https://') ? user.avatar : null

    let marker = null
    try { marker = localStorage.getItem(nameMarkerKey(uid)) } catch { /* 存不了就當作沒有記錄 */ }
    const nameChanged = marker !== null && marker !== user.name

    const jobs = groups.flatMap(g => {
      const mine = g.memberProfiles?.[uid]
      if (!mine) return []
      const fields = {}
      if (avatar && mine.avatar !== avatar) fields[`memberProfiles.${uid}.avatar`] = avatar
      if (nameChanged && mine.name !== user.name) fields[`memberProfiles.${uid}.name`] = user.name
      if (Object.keys(fields).length === 0) return []
      const key = `${g.id}:${avatar}:${nameChanged ? user.name : ''}`
      if (attempted.current.has(key)) return []
      attempted.current.add(key)
      return [updateDoc(doc(db, 'groups', g.id), fields).catch(e => console.warn('sync profile failed', g.id, e?.code || e))]
    })

    if (marker === null || nameChanged) {
      Promise.all(jobs).then(() => {
        try { localStorage.setItem(nameMarkerKey(uid), user.name) } catch { /* 同上 */ }
      })
    }
  }, [user, groups, groupsLoaded])
}

export default useSyncMemberProfile
