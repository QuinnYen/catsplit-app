// 固定收支與固定轉帳：開啟帳本時補入漏掉的項目（Firestore 讀寫；計算在 recurring.js）。
// 每個區塊（最多 200 筆）在同一個交易裡：確認規則的 generatedThrough 還是計畫時的值（另一個分頁或裝置已經補過就放棄）、
// 寫入帳目、用 increment 更新帳戶餘額、推進 generatedThrough。帳目 id 固定，且進度與餘額同一個交易，所以重複開啟或同時開兩個分頁不會重複入帳。
import { doc, runTransaction, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { accountsPath, transactionsPath, recurringPath } from './paths.js'
import { planRecurring, addDays } from './recurring.js'
import { loadHolidayYears, makeIsHoliday } from './holidays.js'

const todayYear = (today) => Number(today.slice(0, 4))

// 需要哪些年份的假日資料：最早一筆待補日期所在年到明年
const yearsNeeded = (rules, today) => {
  const starts = rules.filter((r) => r.enabled !== false).map((r) => (r.generatedThrough ? addDays(r.generatedThrough, 1) : r.startDate)).filter((d) => d <= today)
  if (starts.length === 0) return []
  const first = Number(starts.sort()[0].slice(0, 4))
  return Array.from({ length: todayYear(today) + 1 - first + 1 }, (_, i) => first + i)
}

/**
 * 補入固定收支。回傳 { added, capped }。holidayAdjust 為 none 時不會抓假日資料。
 * 計畫與寫入分開：中途失敗（網路、權限）會丟出錯誤，已寫完的區塊不會重做，下次開啟從 generatedThrough 繼續。
 */
export const runRecurring = async ({ uid, ledger, rules, accounts, today, holidayAdjust = 'none', storage = globalThis.localStorage }) => {
  const accountsById = new Map(accounts.map((a) => [a.id, a]))
  let isHoliday = () => false
  if (holidayAdjust !== 'none') {
    const years = yearsNeeded(rules, today)
    if (years.length > 0) isHoliday = makeIsHoliday(await loadHolidayYears(years, { storage }))
  }
  const { chunks, total, capped } = planRecurring({ rules, today, ledgerBaseCurrency: ledger.baseCurrency, accountsById, holidayAdjust, isHoliday })

  let added = 0
  const stopped = new Set() // 這個規則已被別處補過，後面的區塊也不用做了
  for (const chunk of chunks) {
    if (stopped.has(chunk.ruleId)) continue
    const ruleRef = doc(db, ...recurringPath(uid, ledger.id), chunk.ruleId)
    const done = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ruleRef)
      if (!snap.exists() || (snap.data().generatedThrough ?? null) !== chunk.expectedThrough) return false
      for (const e of chunk.entries) tx.set(doc(db, ...transactionsPath(uid, ledger.id), e.id), { ...e.data, createdAt: serverTimestamp() })
      for (const [accountId, delta] of Object.entries(chunk.deltas)) tx.update(doc(db, ...accountsPath(uid, ledger.id), accountId), { balance: increment(delta) })
      tx.update(ruleRef, { generatedThrough: chunk.newThrough })
      return true
    })
    if (done) added += chunk.entries.length
    else stopped.add(chunk.ruleId)
  }
  return { added, capped, total }
}
