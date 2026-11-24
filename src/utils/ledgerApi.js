import { auth } from '../config/firebase'

const DELETE_LEDGER_URL = import.meta.env.VITE_TOKEN_EXCHANGE_URL?.replace('/lineLogin', '/deleteLedger')

// 刪除自己的一個個人帳本（帳戶、帳目、群組連結與帳本文件）：由雲端函式用 recursiveDelete 刪整棵子樹。
// 不在客戶端刪：帳目沒有數量上限，單一 writeBatch 最多 500 個操作；rules 也不允許客戶端刪帳本文件
export const deleteLedger = async (ledgerId) => {
  if (!DELETE_LEDGER_URL) throw new Error('delete_ledger_url_not_configured')
  const idToken = await auth.currentUser.getIdToken()
  const res = await fetch(DELETE_LEDGER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ ledgerId }),
  })
  if (!res.ok) throw new Error(`deleteLedger ${res.status}`)
}
