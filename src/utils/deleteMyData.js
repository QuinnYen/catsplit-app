import { doc, collection, getDocs, updateDoc, writeBatch, arrayRemove, deleteField } from 'firebase/firestore'
import { db } from '../config/firebase'
import { deleteGroupFiles } from './storageCleanup'

// 只有自己一人、且自己是建立者的群組會整個刪除（Firestore 規則只允許建立者刪群組）；其餘一律退出
const isSoleOwnedGroup = (group, uid) =>
  group.members.length === 1 && group.createdBy === uid

export const planDeleteMyData = (groups, uid) => ({
  toDelete: groups.filter(g => isSoleOwnedGroup(g, uid)),
  toLeave: groups.filter(g => !isSoleOwnedGroup(g, uid)),
})

const deleteWholeGroup = async (groupId) => {
  await deleteGroupFiles(groupId)
  const [expensesSnap, settlementsSnap] = await Promise.all([
    getDocs(collection(db, 'groups', groupId, 'expenses')),
    getDocs(collection(db, 'groups', groupId, 'settlements')),
  ])
  const batch = writeBatch(db)
  expensesSnap.docs.forEach(d => batch.delete(d.ref))
  settlementsSnap.docs.forEach(d => batch.delete(d.ref))
  batch.delete(doc(db, 'groups', groupId))
  await batch.commit()
}

const leaveGroup = (groupId, uid) =>
  updateDoc(doc(db, 'groups', groupId), {
    members: arrayRemove(uid),
    [`memberProfiles.${uid}`]: deleteField(),
  })

const deleteMyPaymentMethods = async (uid) => {
  const snap = await getDocs(collection(db, 'users', uid, 'paymentMethods'))
  if (snap.empty) return
  const batch = writeBatch(db)
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
}

// 依序處理；中途失敗會丟出錯誤，已處理的群組不會回復，重按一次即可繼續
export const deleteMyData = async (groups, uid) => {
  const { toDelete, toLeave } = planDeleteMyData(groups, uid)
  for (const g of toDelete) await deleteWholeGroup(g.id)
  for (const g of toLeave) await leaveGroup(g.id, uid)
  await deleteMyPaymentMethods(uid)
}
