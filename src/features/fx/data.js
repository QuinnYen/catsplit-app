// 旅程的 Firestore 讀寫（資料存取層）：畫面不直接組路徑。旅程文件欄位見 docs/superpowers/specs/2026-11-26-fx-page-design.md 2.1。
import { collection, doc, setDoc, updateDoc, deleteDoc, getDocs, query, where, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { tripsPath, transactionsPath } from '../ledger/paths.js'
import { fxSettingsPath } from './paths.js'
import { purgeTrip as purgeTripCore } from './trashPurge.js'

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

// ---------- 計算機設定（users/{uid}/settings/fx）----------

// 只寫有改的欄位（merge）；patch 的欄位與驗證見 fxSettings.js 的 parseSetting
export const saveFxSettings = (uid, patch) => setDoc(doc(db, ...fxSettingsPath(uid)), patch, { merge: true })

// 自訂匯率：整個 customRates 欄位一起寫（mergeFields 會取代整個欄位，單純 merge 會留下已刪除的鍵）
export const saveCustomRates = (uid, customRates) => setDoc(doc(db, ...fxSettingsPath(uid)), { customRates }, { mergeFields: ['customRates'] })

// 自訂捷徑：整個 customShortcuts 欄位一起寫（理由同上）
export const saveCustomShortcuts = (uid, customShortcuts) => setDoc(doc(db, ...fxSettingsPath(uid)), { customShortcuts }, { mergeFields: ['customShortcuts'] })

// 還原預設值：刪掉整份設定文件
export const resetFxSettings = (uid) => deleteDoc(doc(db, ...fxSettingsPath(uid)))

// ---------- 旅程垃圾桶（見 trash.js、trashPurge.js）----------

// 移到垃圾桶：只寫 deletedAt，帳目不動。用客戶端時間（不是 serverTimestamp），寫入當下就有值，旅程不會在列表上閃一下又消失
export const trashTrip = (uid, ledgerId, tripId) =>
  updateDoc(doc(db, ...tripsPath(uid, ledgerId), tripId), { deletedAt: Timestamp.now() })

export const restoreTrip = (uid, ledgerId, tripId) =>
  updateDoc(doc(db, ...tripsPath(uid, ledgerId), tripId), { deletedAt: deleteField() })

// 旅程的全部帳目（永久刪除前預覽筆數與要退回的餘額用）
export const loadTripTxs = async (uid, ledgerId, tripId) =>
  (await getDocs(query(collection(db, ...transactionsPath(uid, ledgerId)), where('tripId', '==', tripId)))).docs.map((d) => ({ id: d.id, ...d.data() }))

// 永久刪除：連同帳目刪除並退回餘額，見 trashPurge.js；opts.maxTxs 限制這次最多刪幾筆
export const purgeTrip = (uid, ledgerId, tripId, opts) => purgeTripCore(db, uid, ledgerId, tripId, opts)
