import { doc, collection, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { computeGroupAggregates } from './expenseHelpers'

/**
 * 讀取群組全部支出與轉帳，重算彙總欄位並寫回群組文件（編輯／刪除支出、刪除轉帳共用）。
 * activity（選填）：{ by, name, text }，會在同一次寫入裡更新 lastActivity。
 */
export const recomputeGroupAggregates = async (groupId, members, { activity } = {}) => {
  const [expSnap, setSnap] = await Promise.all([
    getDocs(collection(db, 'groups', groupId, 'expenses')),
    getDocs(collection(db, 'groups', groupId, 'settlements')),
  ])
  await updateDoc(doc(db, 'groups', groupId), {
    ...computeGroupAggregates(members, expSnap.docs, setSnap.docs),
    ...(activity && { lastActivity: { at: serverTimestamp(), ...activity } }),
  })
}
