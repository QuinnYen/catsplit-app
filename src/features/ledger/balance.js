// 帳戶餘額。餘額存在帳戶文件的 balance，記帳時在同一個 batch 用 increment 更新；
// 這裡算「這筆帳目對各帳戶的增量」，以及重新計算（修復漂移）用的加總。
// 快照帳目（從群組同步、尚未匯入）不影響任何帳戶餘額。
import { isSnapshotTx } from './source.js'
import { addMoney, roundMoney } from './money.js'

const clean = (v) => (v === 0 ? 0 : v) // 避免 -0

const addTo = (map, id, delta) => {
  map[id] = clean(addMoney(map[id] ?? 0, delta))
}

// 一筆帳目對各帳戶餘額的增量：{ [accountId]: delta }
export const balanceDeltas = (tx) => {
  if (!tx || isSnapshotTx(tx)) return {}
  const out = {}
  if (tx.type === 'expense') addTo(out, tx.accountId, -(tx.accountAmount ?? tx.amount))
  else if (tx.type === 'income') addTo(out, tx.accountId, tx.accountAmount ?? tx.amount)
  else if (tx.type === 'transfer') {
    addTo(out, tx.accountId, -tx.amount)
    addTo(out, tx.toAccountId, tx.toAmount)
  }
  return out
}

// 新增帳目：增量就是 balanceDeltas(tx)；刪除帳目：反向；編輯：新的減舊的。結果略過為 0 的帳戶
export const deltasForChange = (oldTx, newTx) => {
  const out = {}
  for (const [id, d] of Object.entries(balanceDeltas(newTx))) addTo(out, id, d)
  for (const [id, d] of Object.entries(balanceDeltas(oldTx))) addTo(out, id, -d)
  return Object.fromEntries(Object.entries(out).filter(([, d]) => d !== 0))
}

// 「重新計算」：初始餘額加上該帳戶所有帳目的增量
export const computeBalance = (account, transactions) =>
  roundMoney(transactions.reduce((sum, tx) => addMoney(sum, balanceDeltas(tx)[account.id] ?? 0), account.initialBalance ?? 0))
