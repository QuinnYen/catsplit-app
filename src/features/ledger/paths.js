// 個人帳本的 Firestore 路徑與固定 id。路徑以陣列表示，可直接展開給 doc()／collection()：
//   collection(db, ...transactionsPath(uid, ledgerId))
export const ledgersPath = (uid) => ['users', uid, 'ledgers']
export const ledgerPath = (uid, ledgerId) => [...ledgersPath(uid), ledgerId]
export const accountsPath = (uid, ledgerId) => [...ledgerPath(uid, ledgerId), 'accounts']
export const transactionsPath = (uid, ledgerId) => [...ledgerPath(uid, ledgerId), 'transactions']
export const categoriesPath = (uid, ledgerId) => [...ledgerPath(uid, ledgerId), 'categories']
export const recurringPath = (uid, ledgerId) => [...ledgerPath(uid, ledgerId), 'recurring']
export const groupLinksPath = (uid, ledgerId) => [...ledgerPath(uid, ledgerId), 'groupLinks']
// 旅程（匯率頁）：帳目用選填欄位 tripId 指向它，見 docs/superpowers/specs/2026-11-26-fx-page-design.md
export const tripsPath = (uid, ledgerId) => [...ledgerPath(uid, ledgerId), 'trips']

// 快照帳戶的 id 固定，重複連結同一個群組不會產生第二個
export const snapshotAccountId = (groupId) => `snap_${groupId}`

// 群組帳目同步成個人帳目的固定 id：重複同步就是覆寫，不會重複入帳（kind: 'expense' | 'income'）
export const syncedTxId = (groupId, kind, itemId) => `g_${groupId}_${kind === 'income' ? 'i' : 'e'}_${itemId}`
