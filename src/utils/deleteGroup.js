import { auth } from '../config/firebase'

const DELETE_GROUP_URL = import.meta.env.VITE_TOKEN_EXCHANGE_URL?.replace('/lineLogin', '/deleteGroup')

// 刪除整個群組（只有建立者）：由雲端函式用 recursiveDelete 刪掉帳目、群組與 Storage 檔案。
// 不在客戶端刪：單一 writeBatch 最多 500 個操作，帳目多的群組會刪不掉
export const deleteGroup = async (groupId) => {
  if (!DELETE_GROUP_URL) throw new Error('delete_group_url_not_configured')
  const idToken = await auth.currentUser.getIdToken()
  const res = await fetch(DELETE_GROUP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ groupId }),
  })
  if (!res.ok) throw new Error(`deleteGroup ${res.status}`)
}
