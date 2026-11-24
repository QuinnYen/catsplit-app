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
