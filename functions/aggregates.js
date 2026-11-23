// 群組彙總欄位的比對（純函式，無 import）。
// 彙總（totalAmount、totalExpenses、totalIncome、incomeCount、memberBalances、memberExpenseCounts）存在群組文件上，
// 由客戶端新增帳目時用 increment 更新、編輯與刪除時整批重算；真正的來源是三個子集合的全部帳目。
// 這裡只負責「存的值和重算出來的值差在哪」，重算本身用客戶端同一份 computeGroupAggregates，避免兩套邏輯。

const EPS = 0.005 // 金額到分，浮點誤差不算差異

export const SCALAR_FIELDS = ['totalAmount', 'totalExpenses', 'totalIncome', 'incomeCount']
export const MAP_FIELDS = ['memberBalances', 'memberExpenseCounts']

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
export const round2 = (n) => Math.round(n * 100) / 100

/**
 * 比較群組文件上存的彙總與重算出來的值，回傳差異清單 [{ field, key?, stored, expected }]，沒有差異回空陣列。
 * 欄位或成員沒有存視為 0（舊群組可能沒有 totalIncome 之類的欄位）。
 */
export const diffAggregates = (stored, expected) => {
  const diffs = []
  for (const field of SCALAR_FIELDS) {
    const s = num(stored?.[field])
    const e = num(expected?.[field])
    if (Math.abs(s - e) > EPS) diffs.push({ field, stored: s, expected: e })
  }
  for (const field of MAP_FIELDS) {
    const sMap = stored?.[field] && typeof stored[field] === 'object' ? stored[field] : {}
    const eMap = expected?.[field] ?? {}
    for (const key of new Set([...Object.keys(sMap), ...Object.keys(eMap)])) {
      const s = num(sMap[key])
      const e = num(eMap[key])
      if (Math.abs(s - e) > EPS) diffs.push({ field, key, stored: s, expected: e })
    }
  }
  return diffs
}

// 寫回群組文件的值：金額與餘額取到分，避免把浮點誤差（0.30000000000000004）存進去
export const normalizeAggregates = (expected) => ({
  totalAmount: round2(num(expected.totalAmount)),
  totalExpenses: num(expected.totalExpenses),
  totalIncome: round2(num(expected.totalIncome)),
  incomeCount: num(expected.incomeCount),
  memberBalances: Object.fromEntries(Object.entries(expected.memberBalances ?? {}).map(([k, v]) => [k, round2(num(v))])),
  memberExpenseCounts: Object.fromEntries(Object.entries(expected.memberExpenseCounts ?? {}).map(([k, v]) => [k, num(v)])),
})
