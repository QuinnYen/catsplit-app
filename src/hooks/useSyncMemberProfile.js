// 把自己的頭像與顯示名稱（全域暱稱，沒有就用 LINE 名字）同步到所在群組的 memberProfiles。
// 群組裡存的是加入當下的副本，不會自己更新；LINE 成員在群組內不能改名，所以和群組內的不同就直接更新。
import { useEffect, useRef } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'

const useSyncMemberProfile = (groups, groupsLoaded) => {
  const { user, nicknameReady } = useApp()
  const attempted = useRef(new Set())

  useEffect(() => {
    // 要等暱稱確認完，否則會先用 LINE 名字蓋掉暱稱
    if (!user || user.guest || !groupsLoaded || !nicknameReady || !user.name) return
    const uid = user.uid
    const avatar = typeof user.avatar === 'string' && user.avatar.startsWith('https://') ? user.avatar : null

    groups.forEach(g => {
      const mine = g.memberProfiles?.[uid]
      if (!mine) return
      const fields = {}
      if (avatar && mine.avatar !== avatar) fields[`memberProfiles.${uid}.avatar`] = avatar
      if (mine.name !== user.name) fields[`memberProfiles.${uid}.name`] = user.name
      if (Object.keys(fields).length === 0) return
      const key = `${g.id}:${avatar}:${user.name}`
      if (attempted.current.has(key)) return
      attempted.current.add(key)
      updateDoc(doc(db, 'groups', g.id), fields).catch(e => console.warn('sync profile failed', g.id, e?.code || e))
    })
  }, [user, nicknameReady, groups, groupsLoaded])
}

export default useSyncMemberProfile
