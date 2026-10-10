import { doc, collection, getDocs, writeBatch } from 'firebase/firestore'
import { db, auth } from '../config/firebase'
import { deleteGroupFiles } from './storageCleanup'

// 只有自己一人、且自己是建立者的群組會整個刪除（Firestore 規則只允許建立者刪群組）；其餘一律退出
const isSoleOwnedGroup = (group, uid) =>
  group.members.length === 1 && group.createdBy === uid

// 訪客名字的 id 以 p_ 開頭（LINE userId 不含底線）
const isGuestId = (id) => typeof id === 'string' && id.startsWith('p_')

// 建立者退出且沒有其他 LINE 成員時，雲端函式會把整個群組刪除（見 detachMember）
const isDissolvedOnLeave = (group, uid) =>
  group.createdBy === uid && !group.members.some(m => m !== uid && !isGuestId(m))

export const planDeleteMyData = (groups, uid) => {
  const toDelete = groups.filter(g => isSoleOwnedGroup(g, uid))
  const toLeave = groups.filter(g => !isSoleOwnedGroup(g, uid))
  return { toDelete, toLeave, toDissolve: toLeave.filter(g => isDissolvedOnLeave(g, uid)) }
}

const deleteWholeGroup = async (groupId) => {
  await deleteGroupFiles(groupId)
  const [expensesSnap, settlementsSnap, incomesSnap] = await Promise.all([
    getDocs(collection(db, 'groups', groupId, 'expenses')),
    getDocs(collection(db, 'groups', groupId, 'settlements')),
    getDocs(collection(db, 'groups', groupId, 'incomes')),
  ])
  const batch = writeBatch(db)
  expensesSnap.docs.forEach(d => batch.delete(d.ref))
  settlementsSnap.docs.forEach(d => batch.delete(d.ref))
  incomesSnap.docs.forEach(d => batch.delete(d.ref))
  batch.delete(doc(db, 'groups', groupId))
  await batch.commit()
}

const DETACH_MEMBER_URL = import.meta.env.VITE_TOKEN_EXCHANGE_URL?.replace('/lineLogin', '/detachMember')

// 退出群組但保留帳目：雲端函式把自己轉成訪客名字（沿用原名字）；建立者退出時會轉讓給其他 LINE 成員。
// deleteAccount：全部退出後連登入紀錄（Auth）一併刪除
export const detachFromGroups = async (groupIds, { deleteAccount = false } = {}) => {
  const idToken = await auth.currentUser.getIdToken()
  const res = await fetch(DETACH_MEMBER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ groupIds, deleteAccount }),
  })
  if (!res.ok) throw new Error(`detachMember ${res.status}`)
  const { failed } = await res.json()
  if (failed.length > 0) throw new Error(`detachMember failed: ${failed.join(',')}`)
}

const deleteMyPaymentMethods = async (uid) => {
  const snap = await getDocs(collection(db, 'users', uid, 'paymentMethods'))
  if (snap.empty) return
  const batch = writeBatch(db)
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
}

// 依序處理；中途失敗會丟出錯誤，已處理的群組不會回復，重按一次即可繼續。
// 登入紀錄必須最後刪（收款方式要用登入身分才刪得掉），前面失敗就不會刪，重試時仍能登入
export const deleteMyData = async (groups, uid) => {
  const { toDelete, toLeave } = planDeleteMyData(groups, uid)
  for (const g of toDelete) await deleteWholeGroup(g.id)
  await deleteMyPaymentMethods(uid)
  await detachFromGroups(toLeave.map(g => g.id), { deleteAccount: true })
}
