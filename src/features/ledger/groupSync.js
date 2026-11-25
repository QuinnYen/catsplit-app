// 個人帳本 ⇄ 分帳群組：連結、同步、取消連結、匯入到帳戶的 Firestore 讀寫。
// 計算都在純函式（syncPlan.js、importPlan.js），這裡只負責讀資料、分批寫入與更新快照帳戶的筆數與淨額。
import { collection, doc, getDoc, getDocs, query, where, writeBatch, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { fetchExchangeRate } from '../../config/currencies'
import { accountsPath, transactionsPath, groupLinksPath, snapshotAccountId } from './paths.js'
import { planGroupSync } from './syncPlan.js'
import { planImport } from './importPlan.js'
import { isSnapshotTx } from './source.js'
import { chunk } from './batch.js'
import { SNAPSHOT_ACCOUNT_TYPE } from './constants.js'

const withId = (d) => ({ id: d.id, ...d.data() })
const GROUP_NAME_MAX = 50

const snapshotAccountData = (ledger, groupName, extra = {}) => ({
  name: groupName.slice(0, 20),
  type: SNAPSHOT_ACCOUNT_TYPE,
  currency: ledger.baseCurrency,
  initialBalance: 0,
  balance: 0,
  kind: 'group',
  syncedCount: 0,
  syncedNet: 0,
  ...extra,
})

// 這個群組在帳本裡的所有同步帳目（快照與已匯入的）
const loadGroupRows = async (uid, ledgerId, groupId) => {
  const snap = await getDocs(query(collection(db, ...transactionsPath(uid, ledgerId)), where('source.groupId', '==', groupId)))
  return snap.docs.map(withId)
}

// 還沒匯入的快照帳目（匯入預覽與匯入用）
export const loadSnapshotRows = async (uid, ledgerId, groupId) =>
  (await loadGroupRows(uid, ledgerId, groupId)).filter(isSnapshotTx)

/** 連結群組：寫入連結（linkedAt = 現在，不帶歷史）與快照帳戶。快照帳戶已存在就只補連結。 */
export const linkGroup = async (uid, ledger, group) => {
  const batch = writeBatch(db)
  const accountRef = doc(db, ...accountsPath(uid, ledger.id), snapshotAccountId(group.id))
  batch.set(doc(db, ...groupLinksPath(uid, ledger.id), group.id), { linkedAt: serverTimestamp(), groupName: group.name.slice(0, GROUP_NAME_MAX) })
  if (!(await getDoc(accountRef)).exists()) {
    batch.set(accountRef, { ...snapshotAccountData(ledger, group.name), createdAt: serverTimestamp() })
  }
  await batch.commit()
}

/** 取消連結：刪掉還沒匯入的快照帳目、快照帳戶與連結（已匯入的一般帳目保留）。連結最後才刪，中途失敗可以重試。 */
export const unlinkGroup = async (uid, ledgerId, groupId) => {
  const rows = (await loadGroupRows(uid, ledgerId, groupId)).filter(isSnapshotTx)
  for (const part of chunk(rows)) {
    const batch = writeBatch(db)
    for (const r of part) batch.delete(doc(db, ...transactionsPath(uid, ledgerId), r.id))
    await batch.commit()
  }
  const batch = writeBatch(db)
  batch.delete(doc(db, ...accountsPath(uid, ledgerId), snapshotAccountId(groupId)))
  batch.delete(doc(db, ...groupLinksPath(uid, ledgerId), groupId))
  await batch.commit()
}

/**
 * 同步一個群組。link：{ id, linkedAt, groupName }；snapshotAccount：帳戶清單裡目前的快照帳戶（可能不存在）。
 * 回傳 { status: 'ok' | 'unreadable', changed, ratePending }。
 *  - unreadable：群組已刪除或本人已退出，不動現有快照帳目
 *  - ratePending：兩邊基準幣不同、又抓不到匯率，有些帳目這次沒同步
 */
export const syncGroup = async ({ uid, ledger, link, snapshotAccount }) => {
  const groupId = link.id
  let group
  try {
    const snap = await getDoc(doc(db, 'groups', groupId))
    if (!snap.exists() || !snap.data().members?.includes(uid)) return { status: 'unreadable', changed: 0, ratePending: false }
    group = snap.data()
  } catch (e) {
    console.error('Failed to read group for sync', e)
    return { status: 'unreadable', changed: 0, ratePending: false }
  }

  let expenses
  let incomes
  try {
    const q = (name) => getDocs(query(collection(db, 'groups', groupId, name), where('createdAt', '>=', link.linkedAt)))
    const [e, i] = await Promise.all([q('expenses'), q('incomes')])
    expenses = e.docs.map(withId)
    incomes = i.docs.map(withId)
  } catch (e) {
    console.error('Failed to read group entries for sync', e)
    return { status: 'unreadable', changed: 0, ratePending: false }
  }
  const existing = await loadGroupRows(uid, ledger.id, groupId)

  const groupBaseCurrency = group.baseCurrency || ledger.baseCurrency
  const input = { uid, groupId, linkedAt: link.linkedAt, groupBaseCurrency, ledgerBaseCurrency: ledger.baseCurrency, expenses, incomes, existing, now: serverTimestamp() }
  let plan = planGroupSync(input)
  if (plan.pending.length > 0 && groupBaseCurrency !== ledger.baseCurrency) {
    try {
      plan = planGroupSync({ ...input, groupToLedgerRate: await fetchExchangeRate(groupBaseCurrency, ledger.baseCurrency) })
    } catch (e) {
      console.error('Failed to fetch rate for group sync', e)
    }
  }

  const accountRef = doc(db, ...accountsPath(uid, ledger.id), snapshotAccountId(groupId))
  const name = group.name || link.groupName
  const accountStale = !snapshotAccount
    || snapshotAccount.syncedCount !== plan.snapshot.count || snapshotAccount.syncedNet !== plan.snapshot.net
    || (name && snapshotAccount.name !== name.slice(0, 20))
  const linkStale = name && link.groupName !== name.slice(0, GROUP_NAME_MAX)
  const ops = [
    ...plan.upserts.map((u) => ({ ref: doc(db, ...transactionsPath(uid, ledger.id), u.id), set: u.data })),
    ...plan.deletes.map((id) => ({ ref: doc(db, ...transactionsPath(uid, ledger.id), id), del: true })),
  ]
  const changed = ops.length
  if (changed === 0 && !accountStale && !linkStale) return { status: 'ok', changed, ratePending: plan.pending.length > 0 }

  for (const part of chunk(ops)) {
    const batch = writeBatch(db)
    for (const op of part) op.del ? batch.delete(op.ref) : batch.set(op.ref, op.set)
    await batch.commit()
  }
  const batch = writeBatch(db)
  const counts = { syncedCount: plan.snapshot.count, syncedNet: plan.snapshot.net }
  if (snapshotAccount) batch.update(accountRef, { ...counts, ...(name && { name: name.slice(0, 20) }) })
  else batch.set(accountRef, { ...snapshotAccountData(ledger, name || groupId, counts), createdAt: serverTimestamp() })
  if (linkStale) batch.update(doc(db, ...groupLinksPath(uid, ledger.id), groupId), { groupName: name.slice(0, GROUP_NAME_MAX) })
  await batch.commit()
  return { status: 'ok', changed, ratePending: plan.pending.length > 0 }
}

/**
 * 把快照帳目覆寫匯入目標帳戶。rows 是 loadSnapshotRows 的結果；rates 見 planImport。
 * 每批最多 BATCH_SIZE 筆，批次內同時用 increment 更新目標帳戶的餘額與快照帳戶的筆數、淨額。回傳匯入的筆數。
 */
export const importGroupRows = async ({ uid, ledgerId, groupId, rows, target, rates }) => {
  const snapshotRef = doc(db, ...accountsPath(uid, ledgerId), snapshotAccountId(groupId))
  const hasSnapshotAccount = (await getDoc(snapshotRef)).exists()
  let imported = 0
  for (const part of chunk(rows.filter(isSnapshotTx))) {
    const plan = planImport({ rows: part, target, rates })
    if (plan.missingRates.length > 0) throw new Error(`missing rates: ${plan.missingRates.join(',')}`)
    const batch = writeBatch(db)
    for (const u of plan.updates) batch.update(doc(db, ...transactionsPath(uid, ledgerId), u.id), u.data)
    batch.update(doc(db, ...accountsPath(uid, ledgerId), target.id), { balance: increment(plan.balanceDelta) })
    if (hasSnapshotAccount) batch.update(snapshotRef, { syncedCount: increment(plan.snapshotDelta.count), syncedNet: increment(plan.snapshotDelta.net) })
    await batch.commit()
    imported += plan.updates.length
  }
  return imported
}
