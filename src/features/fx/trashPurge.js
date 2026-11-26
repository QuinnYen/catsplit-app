// 永久刪除垃圾桶中的旅程：連同帳目刪除，並把帳目對帳戶餘額的影響退回。
// 傳入 db（而不是直接 import），這樣整合測試可以用模擬器加真正的 rules 跑，不用載入瀏覽器的 firebase 設定。
//
// 安全性：帳目分批（PURGE_CHUNK 筆）處理，**每批在一個 Firestore 交易裡**——
//   1. 先讀旅程文件，確認還在垃圾桶（使用者在別處還原了就中止，不再刪任何東西）
//   2. 讀這批帳目，只對「還存在」的帳目刪除並退回餘額（兩個分頁、或自動與手動同時執行，同一筆帳目只會退一次）
//   3. 讀受影響的帳戶，存在才更新（帳戶被刪了就略過）
// 全部帳目刪完才刪旅程文件。中途失敗或預算用完時旅程仍在垃圾桶，下次可以接著處理，已刪的帳目不會再退一次。
import { collection, doc, getDocs, query, where, limit, runTransaction, increment } from 'firebase/firestore'
import { tripsPath, transactionsPath, accountsPath } from '../ledger/paths.js'
import { planTripPurge } from './trash.js'

export const PURGE_CHUNK = 100

/**
 * @param opts.maxTxs 這次最多刪幾筆帳目（自動清除用，預設不限制）
 * @returns { deleted, finished, reason? }
 *   finished：旅程文件已刪除。沒完成時 reason：budget（預算用完）、restored（被還原了）、missing（旅程不存在）、stuck（連續沒有進展）
 */
export const purgeTrip = async (db, uid, ledgerId, tripId, { maxTxs = Infinity } = {}) => {
  const tripRef = doc(db, ...tripsPath(uid, ledgerId), tripId)
  const txCol = collection(db, ...transactionsPath(uid, ledgerId))
  let deleted = 0
  let idle = 0
  for (;;) {
    if (deleted >= maxTxs) return { deleted, finished: false, reason: 'budget' }
    const snap = await getDocs(query(txCol, where('tripId', '==', tripId), limit(Math.min(PURGE_CHUNK, maxTxs - deleted))))
    if (snap.empty) break

    const result = await runTransaction(db, async (t) => {
      const trip = await t.get(tripRef)
      if (!trip.exists()) return { stop: 'missing' }
      if (!trip.data().deletedAt) return { stop: 'restored' }
      const docs = await Promise.all(snap.docs.map((d) => t.get(d.ref)))
      const existing = docs.filter((s) => s.exists())
      const { deltas } = planTripPurge(existing.map((s) => ({ id: s.id, ...s.data() })))
      const accounts = await Promise.all(Object.keys(deltas).map((id) => t.get(doc(db, ...accountsPath(uid, ledgerId), id))))
      for (const s of existing) t.delete(s.ref)
      for (const a of accounts) if (a.exists()) t.update(a.ref, { balance: increment(deltas[a.id]) })
      return { count: existing.length }
    })

    if (result.stop) return { deleted, finished: false, reason: result.stop }
    deleted += result.count
    // 這批帳目都已被別處刪掉（count 0）是正常的，下一輪會查到剩下的；連續好幾輪都沒進展就停，避免無限迴圈
    idle = result.count === 0 ? idle + 1 : 0
    if (idle >= 3) return { deleted, finished: false, reason: 'stuck' }
  }

  // 帳目都刪完了：再確認一次還在垃圾桶，才刪旅程文件
  const outcome = await runTransaction(db, async (t) => {
    const trip = await t.get(tripRef)
    if (!trip.exists()) return 'missing'
    if (!trip.data().deletedAt) return 'restored'
    t.delete(tripRef)
    return 'ok'
  })
  return outcome === 'ok' ? { deleted, finished: true } : { deleted, finished: false, reason: outcome }
}
