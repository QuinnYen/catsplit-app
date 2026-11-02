import { doc, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore'
import { db } from '../config/firebase'

const BATCH_LIMIT = 500 // Firestore 一個 batch 最多 500 筆操作

// 先刪光 entries 再刪目標：中途失敗時目標還在，重試即可繼續，不會留下找不到父層的孤兒紀錄
export const deleteSavingsGoal = async (uid, goalId) => {
  const snap = await getDocs(collection(db, 'users', uid, 'savingsGoals', goalId, 'entries'))
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + BATCH_LIMIT).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  await deleteDoc(doc(db, 'users', uid, 'savingsGoals', goalId))
}

export const deleteAllSavings = async (uid) => {
  const snap = await getDocs(collection(db, 'users', uid, 'savingsGoals'))
  for (const d of snap.docs) await deleteSavingsGoal(uid, d.id)
}
