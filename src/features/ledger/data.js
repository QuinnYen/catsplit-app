// 個人帳本的 Firestore 讀寫（資料存取層）：畫面與 hooks 不直接組路徑或寫 batch，一律經過這裡。
// 餘額（accounts.balance）在記帳、編輯、刪除時於同一個 batch 用 increment 更新，增量由 balance.js 算。
import { collection, doc, writeBatch, increment, serverTimestamp, getDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { ledgersPath, ledgerPath, accountsPath, transactionsPath } from './paths.js'
import { deltasForChange } from './balance.js'
import { LEDGER_NAME_MAX } from './constants.js'

export const DEFAULT_LEDGER_ID = 'default'
export const DEFAULT_ACCOUNT_ID = 'cash'

/**
 * 建立帳本，並同時建立一個「現金」帳戶（帳戶幣別 = 統計幣別），讓使用者可以馬上記帳。
 * id 不給就用自動 id；回傳帳本 id。名稱與現金帳戶的名稱由呼叫端依語言傳入。
 */
export const createLedger = async (uid, { name, baseCurrency, cashName, id }) => {
  const ledgerId = id ?? doc(collection(db, ...ledgersPath(uid))).id
  const batch = writeBatch(db)
  batch.set(doc(db, ...ledgerPath(uid, ledgerId)), {
    name: name.trim().slice(0, LEDGER_NAME_MAX),
    baseCurrency,
    createdAt: serverTimestamp(),
  })
  batch.set(doc(db, ...accountsPath(uid, ledgerId), DEFAULT_ACCOUNT_ID), {
    name: cashName,
    type: 'cash',
    currency: baseCurrency,
    initialBalance: 0,
    balance: 0,
    kind: 'normal',
    createdAt: serverTimestamp(),
  })
  await batch.commit()
  return ledgerId
}

// 第一次進帳本：沒有任何帳本時建立固定 id 的預設帳本（已存在就什麼都不做，多個分頁同時開也安全）
export const ensureDefaultLedger = async (uid, { name, baseCurrency, cashName }) => {
  const existing = await getDoc(doc(db, ...ledgerPath(uid, DEFAULT_LEDGER_ID)))
  if (existing.exists()) return DEFAULT_LEDGER_ID
  return createLedger(uid, { name, baseCurrency, cashName, id: DEFAULT_LEDGER_ID })
}

/**
 * 新增或編輯一筆帳目，並在同一個 batch 更新帳戶餘額。
 * id 不給就是新增；編輯要傳 id 與 oldTx（原本的帳目文件，用來算餘額的差額，並保留 createdAt）。
 * data 是 buildTransactionData 的結果（不含 createdAt）。回傳帳目 id。
 */
export const saveTransaction = async (uid, ledgerId, { id, data, oldTx }) => {
  const ref = id
    ? doc(db, ...transactionsPath(uid, ledgerId), id)
    : doc(collection(db, ...transactionsPath(uid, ledgerId)))
  const batch = writeBatch(db)
  batch.set(ref, { ...data, createdAt: oldTx?.createdAt ?? serverTimestamp() })
  for (const [accountId, delta] of Object.entries(deltasForChange(oldTx ?? null, data))) {
    batch.update(doc(db, ...accountsPath(uid, ledgerId), accountId), { balance: increment(delta) })
  }
  await batch.commit()
  return ref.id
}

// 刪除一筆帳目，並把它對帳戶餘額的影響退回去
export const deleteTransaction = async (uid, ledgerId, tx) => {
  const batch = writeBatch(db)
  batch.delete(doc(db, ...transactionsPath(uid, ledgerId), tx.id))
  for (const [accountId, delta] of Object.entries(deltasForChange(tx, null))) {
    batch.update(doc(db, ...accountsPath(uid, ledgerId), accountId), { balance: increment(delta) })
  }
  await batch.commit()
}
