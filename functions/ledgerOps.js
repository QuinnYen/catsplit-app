// 個人帳本（P12）的後端操作：刪除整個帳本、刪除某人所有帳本。
// 帳目沒有數量上限，客戶端單一 writeBatch 最多 500 個操作，所以一律由後端用 recursiveDelete 刪整棵子樹
// （users/{uid}/ledgers/{id} 底下的 accounts、transactions、groupLinks 與帳本文件本身）。
// 刪除是冪等的：帳本已經不存在視為成功。

export const LEDGER_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/

export const isValidLedgerId = (id) => typeof id === 'string' && LEDGER_ID_PATTERN.test(id)

export const deleteLedgerTree = async (db, uid, ledgerId) => {
  if (!isValidLedgerId(ledgerId)) throw new Error('invalid ledger id')
  await db.recursiveDelete(db.doc(`users/${uid}/ledgers/${ledgerId}`))
}

// 刪除這個人所有帳本（刪除我的資料時用）。回傳是否有東西被刪（只用於記錄）
export const deleteAllLedgers = async (db, uid) => {
  await db.recursiveDelete(db.collection(`users/${uid}/ledgers`))
}

// ---------- 帳號合併後的修復 ----------
// 兩個帳號都開過帳本時，固定 id 的預設帳本與現金帳戶會衝突、只保留一份，帳目搬過來但 balance 不會相加。
// 合併時對雙方都有的帳本重算一般帳戶的餘額；邏輯與前端 src/features/ledger/balance.js 一致（functions 不能 import src/）。

const roundMoney = (v) => Math.round(v * 1e6) / 1e6

// 快照帳目（群組同步來、尚未匯入）不影響餘額
const isSnapshotTx = (tx) => tx?.source?.type === 'group' && tx.source.detached !== true

const txDeltas = (tx) => {
  if (isSnapshotTx(tx)) return {}
  if (tx.type === 'expense') return { [tx.accountId]: -(tx.accountAmount ?? tx.amount) }
  if (tx.type === 'income') return { [tx.accountId]: tx.accountAmount ?? tx.amount }
  if (tx.type === 'transfer') {
    return { [tx.accountId]: -tx.amount, [tx.toAccountId]: tx.toAmount }
  }
  return {}
}

// accounts：[{ id, ...欄位 }]，transactions：[帳目]。回傳餘額與帳目加總不一致的一般帳戶 [{ id, from, to }]
export const planBalanceRepair = (accounts, transactions) => {
  const sums = {}
  for (const tx of transactions) {
    for (const [id, d] of Object.entries(txDeltas(tx))) sums[id] = roundMoney((sums[id] ?? 0) + d)
  }
  return accounts
    .filter((a) => a.kind !== 'group')
    .map((a) => ({ id: a.id, from: a.balance ?? 0, to: roundMoney((a.initialBalance ?? 0) + (sums[a.id] ?? 0)) }))
    .filter((r) => r.from !== r.to)
}

export const recomputeLedgerBalances = async (db, uid, ledgerId) => {
  const base = `users/${uid}/ledgers/${ledgerId}`
  const [acc, txs] = await Promise.all([db.collection(`${base}/accounts`).get(), db.collection(`${base}/transactions`).get()])
  const fixes = planBalanceRepair(acc.docs.map((d) => ({ id: d.id, ...d.data() })), txs.docs.map((d) => d.data()))
  for (const f of fixes) await db.doc(`${base}/accounts/${f.id}`).update({ balance: f.to })
  return fixes
}

// 兩邊都連結同一個群組時取較早的 linkedAt（Timestamp 或有 toMillis 的物件），讓「連結之後」的範圍涵蓋雙方
export const earlierTimestamp = (a, b) => (a.toMillis() <= b.toMillis() ? a : b)

// 匯出 CSV（LINE 內建瀏覽器用）：個人帳本的檔案存在 exports/{uid}/{ledgerId}/，帳本必須是呼叫者自己的。
// 回傳儲存路徑前綴；ledgerId 無效或帳本不存在回傳 null
export const ledgerExportPrefix = async (db, uid, ledgerId) => {
  if (!isValidLedgerId(ledgerId)) return null
  const snap = await db.doc(`users/${uid}/ledgers/${ledgerId}`).get()
  return snap.exists ? `exports/${uid}/${ledgerId}` : null
}

// 匯出檔案的格式：csv（群組明細與個人帳本 CSV）或 json（只有個人帳本備份）。回傳副檔名、內容類型與字元上限；格式不認得回 null
export const exportFileSpec = (format) => {
  if (format === undefined || format === 'csv') return { ext: 'csv', contentType: 'text/csv; charset=utf-8', maxChars: 1_000_000 }
  if (format === 'json') return { ext: 'json', contentType: 'application/json; charset=utf-8', maxChars: 3_000_000 }
  return null
}
