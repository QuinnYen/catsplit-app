// 個人帳本的 Firestore 讀寫（資料存取層）：畫面與 hooks 不直接組路徑或寫 batch，一律經過這裡。
// 餘額（accounts.balance）在記帳、編輯、刪除時於同一個 batch 用 increment 更新，增量由 balance.js 算。
import { collection, doc, writeBatch, increment, serverTimestamp, getDoc, setDoc, getDocs, query, where, limit } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { ledgersPath, ledgerPath, accountsPath, transactionsPath } from './paths.js'
import { deltasForChange, planBalanceRepair } from './balance.js'
import { roundMoney } from './money.js'
import { LEDGER_NAME_MAX, ACCOUNT_NAME_MAX } from './constants.js'

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

// ---------- 帳戶管理 ----------

const accountRefOf = (uid, ledgerId, accountId) => doc(db, ...accountsPath(uid, ledgerId), accountId)

// 新增帳戶：幣別建立後不可改；餘額從期初餘額開始
export const createAccount = async (uid, ledgerId, { name, type, currency, initialBalance }) => {
  const ref = doc(collection(db, ...accountsPath(uid, ledgerId)))
  await setDoc(ref, {
    name: name.trim().slice(0, ACCOUNT_NAME_MAX),
    type,
    currency,
    initialBalance,
    balance: initialBalance,
    kind: 'normal',
    createdAt: serverTimestamp(),
  })
  return ref.id
}

// 編輯名稱、種類、期初餘額（餘額跟著差額調整）。account 是目前的帳戶文件
export const updateAccount = (uid, ledgerId, account, { name, type, initialBalance }) => {
  const patch = { name: name.trim().slice(0, ACCOUNT_NAME_MAX), type }
  if (initialBalance !== account.initialBalance) {
    patch.initialBalance = initialBalance
    patch.balance = increment(roundMoney(initialBalance - (account.initialBalance ?? 0)))
  }
  const batch = writeBatch(db)
  batch.update(accountRefOf(uid, ledgerId, account.id), patch)
  return batch.commit()
}

export const setAccountArchived = (uid, ledgerId, accountId, archived) => {
  const batch = writeBatch(db)
  batch.update(accountRefOf(uid, ledgerId, accountId), { archived })
  return batch.commit()
}

// 帳戶是否有帳目（記在這個帳戶，或轉帳轉入這個帳戶）；有帳目的帳戶不能刪除，只能封存
export const accountHasTransactions = async (uid, ledgerId, accountId) => {
  const col = collection(db, ...transactionsPath(uid, ledgerId))
  for (const field of ['accountId', 'toAccountId']) {
    const snap = await getDocs(query(col, where(field, '==', accountId), limit(1)))
    if (!snap.empty) return true
  }
  return false
}

export const deleteAccount = (uid, ledgerId, accountId) => {
  const batch = writeBatch(db)
  batch.delete(accountRefOf(uid, ledgerId, accountId))
  return batch.commit()
}

/**
 * 重新計算這個帳本所有帳戶的餘額（讀全部帳目，修復漂移或帳號合併後的餘額）。
 * 回傳被修正的帳戶 [{ id, from, to }]。用 update 直接寫入計算出的餘額。
 */
export const repairBalances = async (uid, ledgerId, accounts) => {
  const snap = await getDocs(collection(db, ...transactionsPath(uid, ledgerId)))
  const txs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const fixes = planBalanceRepair(accounts, txs)
  if (fixes.length === 0) return fixes
  const batch = writeBatch(db)
  for (const f of fixes) batch.update(accountRefOf(uid, ledgerId, f.id), { balance: f.to })
  await batch.commit()
  return fixes
}

// 群組同步來的帳目只能改分類與備註；改過的欄位記在 source.edited，之後同步不再覆寫
export const saveSnapshotEdits = (uid, ledgerId, tx, { category, note }) => {
  const edited = { ...(tx.source.edited ?? {}) }
  if (category !== (tx.category ?? '')) edited.category = true
  if (note !== (tx.note ?? '')) edited.note = true
  const batch = writeBatch(db)
  batch.update(doc(db, ...transactionsPath(uid, ledgerId), tx.id), { category, note, source: { ...tx.source, ...(Object.keys(edited).length > 0 && { edited }) } })
  return batch.commit()
}
