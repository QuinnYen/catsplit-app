// 檢查與修復所有群組的彙總欄位（Firestore 操作，db 與重算函式由呼叫端傳入，所以不 import firebase-admin，可在模擬器直接測）。
// 用法見 scripts/check-aggregates.mjs 與 docs/guides/operations.md。
import { diffAggregates, normalizeAggregates } from './aggregates.js'

const PAGE = 200
const FAILED_PRECONDITION = 9

/**
 * 掃描群組，比對存的彙總與由三個子集合重算的值。
 * options：
 *   computeAggregates(members, expenseDocs, settlementDocs, incomeDocs) — 重算（用客戶端同一份 computeGroupAggregates）
 *   apply — true 才寫回；寫回只動有差異的群組，而且用「讀到的版本」當前提：掃描與寫入之間群組被改過就跳過，不會蓋掉剛新增的帳目
 *   groupId — 只處理這一個群組
 * 回傳 { scanned, mismatched: [{ id, name, diffs, expected, outcome }], fixed, skipped }；
 * outcome 是 'found'（dry-run）、'fixed'、'changed'（寫入前被改過，跳過，重跑即可）。
 */
export const checkAggregates = async (db, { computeAggregates, apply = false, groupId = null } = {}) => {
  const report = { scanned: 0, mismatched: [], fixed: 0, skipped: 0 }

  const handle = async (snap) => {
    const data = snap.data()
    const members = Array.isArray(data.members) ? data.members : []
    const [exp, set, inc] = await Promise.all(
      ['expenses', 'settlements', 'incomes'].map((col) => snap.ref.collection(col).get()),
    )
    const expected = normalizeAggregates(await computeAggregates(members, exp.docs, set.docs, inc.docs))
    report.scanned += 1
    const diffs = diffAggregates(data, expected)
    if (diffs.length === 0) return
    const item = { id: snap.id, name: data.name ?? '', diffs, expected, outcome: 'found' }
    if (apply) {
      try {
        await snap.ref.update(expected, { lastUpdateTime: snap.updateTime })
        item.outcome = 'fixed'
        report.fixed += 1
      } catch (e) {
        if (e.code !== FAILED_PRECONDITION) throw e
        item.outcome = 'changed'
        report.skipped += 1
      }
    }
    report.mismatched.push(item)
  }

  if (groupId) {
    const snap = await db.doc(`groups/${groupId}`).get()
    if (snap.exists) await handle(snap)
    return report
  }

  let last = null
  for (;;) {
    let q = db.collection('groups').orderBy('__name__').limit(PAGE)
    if (last) q = q.startAfter(last)
    const page = await q.get()
    if (page.empty) break
    for (const snap of page.docs) await handle(snap)
    last = page.docs[page.docs.length - 1]
    if (page.size < PAGE) break
  }
  return report
}
