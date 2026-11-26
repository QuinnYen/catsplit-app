// 旅程的 Firestore 讀寫（資料存取層）：畫面不直接組路徑。旅程文件欄位見 docs/superpowers/specs/2026-11-26-fx-page-design.md 2.1。
import { collection, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, deleteField } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { tripsPath } from '../ledger/paths.js'
import { fxSettingsPath } from './paths.js'

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

// 計算機的換算列與實付幣別（存在旅程文件上，換裝置不用重設）；patch：{ rows?, payCurrency? }
export const setTripCalc = (uid, ledgerId, tripId, patch) =>
  updateDoc(doc(db, ...tripsPath(uid, ledgerId), tripId), patch)

export const setTripArchived = (uid, ledgerId, tripId, archived) =>
  updateDoc(doc(db, ...tripsPath(uid, ledgerId), tripId), { archived })

// ---------- 計算機設定（users/{uid}/settings/fx）----------

// 只寫有改的欄位（merge）；patch 的欄位與驗證見 fxSettings.js 的 parseSetting
export const saveFxSettings = (uid, patch) => setDoc(doc(db, ...fxSettingsPath(uid)), patch, { merge: true })

// 自訂匯率：整個 customRates 欄位一起寫（mergeFields 會取代整個欄位，單純 merge 會留下已刪除的鍵）
export const saveCustomRates = (uid, customRates) => setDoc(doc(db, ...fxSettingsPath(uid)), { customRates }, { mergeFields: ['customRates'] })

// 還原預設值：刪掉整份設定文件
export const resetFxSettings = (uid) => deleteDoc(doc(db, ...fxSettingsPath(uid)))
