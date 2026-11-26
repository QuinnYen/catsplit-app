// 旅程的 Firestore 讀寫（資料存取層）：畫面不直接組路徑。旅程文件欄位見 docs/superpowers/specs/2026-11-26-fx-page-design.md 2.1。
import { collection, doc, setDoc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { tripsPath } from '../ledger/paths.js'

const OPTIONAL_DATES = ['startDate', 'endDate']

// data 是 buildTripData 的結果；回傳新旅程 id
export const createTrip = async (uid, ledgerId, data) => {
  const ref = doc(collection(db, ...tripsPath(uid, ledgerId)))
  await setDoc(ref, { ...data, createdAt: serverTimestamp() })
  return ref.id
}

// 編輯旅程：data 裡沒有的日期（使用者清空了）會從文件移除
export const updateTrip = (uid, ledgerId, tripId, data) => {
  const patch = { ...data }
  for (const key of OPTIONAL_DATES) if (!(key in data)) patch[key] = deleteField()
  return updateDoc(doc(db, ...tripsPath(uid, ledgerId), tripId), patch)
}

export const setTripArchived = (uid, ledgerId, tripId, archived) =>
  updateDoc(doc(db, ...tripsPath(uid, ledgerId), tripId), { archived })
