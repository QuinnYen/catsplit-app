import { doc, collection, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { computeGroupAggregates } from './expenseHelpers'

/**
 * 讀取群組全部支出、轉帳與收入，重算彙總欄位並寫回群組文件（編輯／刪除支出、刪除轉帳共用）。
 * activity（選填）：{ by, name, text }，會在同一次寫入裡更新 lastActivity。
 * members 以交易內讀到的群組文件為準，傳入的 members 只當備援。
 */
export const recomputeGroupAggregates = async (groupId, members, { activity } = {}) => {
  const groupRef = doc(db, 'groups', groupId)
  await runTransaction(db, async (tx) => {
    // 正確性只靠群組文件的版本：getDocs 不在交易的讀取集合內，
    // 但新增支出／轉帳的 batch 都會同時改群組文件，期間若有新增，這次提交會失敗並重跑
    const snap = await tx.get(groupRef)
    const currentMembers = snap.data()?.members ?? members
    const [expSnap, setSnap, incSnap] = await Promise.all([
      getDocs(collection(db, 'groups', groupId, 'expenses')),
      getDocs(collection(db, 'groups', groupId, 'settlements')),
      getDocs(collection(db, 'groups', groupId, 'incomes')),
    ])
    tx.update(groupRef, {
      ...computeGroupAggregates(currentMembers, expSnap.docs, setSnap.docs, incSnap.docs),
      ...(activity && { lastActivity: { at: serverTimestamp(), ...activity } }),
    })
  })
}
