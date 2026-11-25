// 帳本還原的 Firestore 寫入（計畫在 backup.js）。還原成新帳本：先分批寫類別、帳戶、固定項目與帳目，最後才寫帳本文件；
// 中途失敗時呼叫後端 deleteLedger 把已寫的部分清掉，不會留下半套資料。
import { collection, doc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { ledgersPath, ledgerPath, accountsPath, transactionsPath, categoriesPath, recurringPath } from './paths.js'
import { planRestore } from './backup.js'
import { chunk } from './batch.js'
import { deleteLedger } from '../../utils/ledgerApi'

const PATHS = { categories: categoriesPath, accounts: accountsPath, recurring: recurringPath, transactions: transactionsPath }

// createdAt 的毫秒轉成 Timestamp；沒有就用伺服器時間
const toFirestore = (data) => ({ ...data, createdAt: data.createdAt != null ? Timestamp.fromMillis(data.createdAt) : serverTimestamp() })

/**
 * 還原備份成新帳本，回傳新帳本 id。onProgress(已寫筆數, 總筆數) 可選。
 * 類別文件沒有 createdAt，其餘文件都有。
 */
export const restoreBackup = async (uid, backup, { name, onProgress } = {}) => {
  const plan = planRestore(backup, { name })
  const ledgerId = doc(collection(db, ...ledgersPath(uid))).id
  const total = plan.ops.length + 1
  let written = 0
  try {
    for (const part of chunk(plan.ops)) {
      const batch = writeBatch(db)
      for (const op of part) {
        const ref = doc(db, ...PATHS[op.collection](uid, ledgerId), op.id)
        batch.set(ref, op.collection === 'categories' ? op.data : toFirestore(op.data))
      }
      await batch.commit()
      written += part.length
      onProgress?.(written, total)
    }
    const batch = writeBatch(db)
    batch.set(doc(db, ...ledgerPath(uid, ledgerId)), toFirestore(plan.ledger.data))
    await batch.commit()
    onProgress?.(total, total)
  } catch (e) {
    try { await deleteLedger(ledgerId) } catch (cleanup) { console.error('Failed to clean up partial restore', cleanup) }
    throw e
  }
  return ledgerId
}
