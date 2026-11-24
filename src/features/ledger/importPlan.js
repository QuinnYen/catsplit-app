// 把群組快照「覆寫匯入」某個帳戶的計畫（純函式）。
// 帳目以固定 id 就地更新：accountId 改成目標帳戶、source.detached = true，之後就是一般帳目（不再同步、可編輯、計入餘額）。
import { roundToCurrency } from '../../config/currencies.js'
import { addMoney } from './money.js'
import { isSnapshotTx } from './source.js'

const negate = (v) => (v === 0 ? 0 : -v) // 避免 -0

/**
 * @param rows   要匯入的快照帳目 [{ id, ...fields }]（非快照帳目會被略過）
 * @param target 目標帳戶 { id, currency }
 * @param rates  { [帳目幣別]: 1 該幣別 = ? 目標帳戶幣別 }；帳目幣別與目標帳戶幣別相同時不需要
 * @returns {
 *   updates: [{ id, data }]  data 只含要改的欄位（accountId、source、跨幣別時的 accountAmount 與 accountRate）
 *   balanceDelta             目標帳戶 balance 要增加多少（收入加、支出減，帳戶幣別）
 *   snapshotDelta            快照帳戶的 { count, net } 增量（負數；net 是統計幣別）
 *   missingRates             還缺哪些幣別的匯率；不為空時，對應的帳目不會出現在 updates
 * }
 */
export const planImport = ({ rows, target, rates = {} }) => {
  const updates = []
  const missing = new Set()
  let balanceDelta = 0
  let snapshotNet = 0

  for (const row of rows) {
    if (!isSnapshotTx(row)) continue
    const data = { accountId: target.id, source: { ...row.source, detached: true } }
    let effect = row.amount
    if (row.currency !== target.currency) {
      const rate = rates[row.currency]
      if (!(rate > 0)) {
        missing.add(row.currency)
        continue
      }
      effect = roundToCurrency(row.amount * rate, target.currency)
      if (!(effect > 0)) {
        missing.add(row.currency)
        continue
      }
      data.accountAmount = effect
      data.accountRate = rate
    }
    const sign = row.type === 'income' ? 1 : -1
    balanceDelta = addMoney(balanceDelta, sign * effect)
    snapshotNet = addMoney(snapshotNet, sign * row.baseAmount)
    updates.push({ id: row.id, data })
  }

  return {
    updates,
    balanceDelta,
    snapshotDelta: { count: negate(updates.length), net: negate(snapshotNet) },
    missingRates: [...missing],
  }
}
