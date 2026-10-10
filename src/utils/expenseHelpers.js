export const toLocalDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 點到輸入欄位時捲到畫面中央，避免被鍵盤擋住；等鍵盤彈出、視窗縮小後再捲
export const scrollFocusedIntoView = (e) => {
  const el = e.target
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
  setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
}

export const todayStr = () => toLocalDateStr(new Date())

// datetime-local 輸入框用的 YYYY-MM-DDTHH:mm（本地時間，精確到分）
export const toLocalDateTimeStr = (d) =>
  `${toLocalDateStr(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export const nowStr = () => toLocalDateTimeStr(new Date())

// 消費時間（hh:mm）；只有存了 hasTime 的支出才有真實時間，舊資料只有日期
export const expenseTimeStr = (item) =>
  item.hasTime && item.createdAt?.toDate
    ? item.createdAt.toDate().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''

const normalizeText = (s) => String(s ?? '').normalize('NFKC').toLowerCase()

/**
 * 出資金額最多的人（金額相同取先出現者），沒有付款資料時回傳 undefined
 */
export const primaryPayer = (payments) =>
  Object.entries(payments || {}).reduce((best, [uid, amt]) => (best === undefined || amt > payments[best] ? uid : best), undefined)

/**
 * 由表單狀態組出 payments { uid: 原幣金額 }；多人付款時略過未填或為 0 的人
 */
export const buildPayments = ({ multiPayer, paidBy, payerAmounts, totalAmount }) => {
  if (!multiPayer) return { [paidBy]: totalAmount }
  return Object.fromEntries(
    Object.entries(payerAmounts)
      .map(([uid, v]) => [uid, parseFloat(v) || 0])
      .filter(([, v]) => v > 0)
  )
}

/**
 * 付款人顯示文字：一人顯示名字，多人顯示「A 等 N 人」
 */
export const payerLabel = (payments, memberProfiles, fallback = '未知') => {
  const uids = Object.keys(payments || {})
  const name = memberProfiles?.[primaryPayer(payments)]?.name || fallback
  return uids.length > 1 ? `${name} 等 ${uids.length} 人` : name
}

/**
 * 搜尋比對：以空白分詞，每個詞都要出現在 標題/備註/類別/付款人/金額 中（子字串）
 */
export const matchExpense = (expense, searchText, memberProfiles) => {
  const tokens = normalizeText(searchText).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = normalizeText([
    expense.title,
    expense.note,
    expense.category,
    ...Object.keys(expense.payments || {}).map(uid => memberProfiles?.[uid]?.name),
    expense.originalAmount ?? expense.amount,
  ].join('\n'))
  return tokens.every(t => haystack.includes(t))
}

/**
 * 計算 splits（以原始幣別為單位）
 * @param {object} params
 * @param {string} params.splitType
 * @param {number} params.totalAmount
 * @param {string[]} params.effectiveUids - 有效成員 uid 列表
 * @param {string[][]} params.allMemberEntries - Object.entries(memberProfiles)
 * @param {object} params.shares
 * @param {object} params.percentages
 * @param {object} params.customAmounts
 * @returns {object} splits map { uid: number }
 */
export const computeSplits = ({ splitType, totalAmount, effectiveUids, allMemberEntries, shares, percentages, customAmounts }) => {
  const sharesTotal = Object.values(shares).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const splits = {}

  if (splitType === 'equal' || splitType === 'subset') {
    const each = parseFloat((totalAmount / effectiveUids.length).toFixed(2))
    effectiveUids.forEach(uid => { splits[uid] = each })
  } else if (splitType === 'shares') {
    effectiveUids.forEach(uid => {
      const s = parseFloat(shares[uid]) || 0
      splits[uid] = parseFloat((s / sharesTotal * totalAmount).toFixed(2))
    })
  } else if (splitType === 'percentage') {
    effectiveUids.forEach(uid => {
      splits[uid] = parseFloat(((parseFloat(percentages[uid]) || 0) / 100 * totalAmount).toFixed(2))
    })
  } else {
    allMemberEntries.forEach(([uid]) => {
      splits[uid] = parseFloat(customAmounts[uid]) || 0
    })
  }

  return splits
}

/**
 * 套用匯率，回傳 baseAmount、baseSplits 與 basePayments
 * 各人金額四捨五入後總和可能與總額差幾分錢，尾差歸最大出資者（不在分攤名單時歸第一位成員）；
 * 出資的尾差一律歸最大出資者，確保出資總和等於 baseAmount
 */
export const applyExchangeRate = ({ totalAmount, splits, payments, currency, baseCurrency, exchangeRate }) => {
  const rate = currency === baseCurrency ? 1 : (exchangeRate ?? 1)
  const convert = (v) => (currency === baseCurrency ? v : parseFloat((v * rate).toFixed(2)))
  const baseAmount = convert(totalAmount)
  const baseSplits = Object.fromEntries(Object.entries(splits).map(([uid, v]) => [uid, convert(v)]))
  const basePayments = Object.fromEntries(Object.entries(payments).map(([uid, v]) => [uid, convert(v)]))
  const payer = primaryPayer(basePayments)

  const uids = Object.keys(baseSplits)
  const splitRemainder = parseFloat((baseAmount - uids.reduce((sum, uid) => sum + baseSplits[uid], 0)).toFixed(2))
  // 只處理四捨五入造成的尾差；差距過大代表分帳本身不平（如自訂金額），不擅自調整
  if (splitRemainder !== 0 && Math.abs(splitRemainder) <= 0.05 * uids.length) {
    const target = uids.includes(payer) ? payer : uids[0]
    baseSplits[target] = parseFloat((baseSplits[target] + splitRemainder).toFixed(2))
  }

  const payUids = Object.keys(basePayments)
  const payRemainder = parseFloat((baseAmount - payUids.reduce((sum, uid) => sum + basePayments[uid], 0)).toFixed(2))
  if (payRemainder !== 0) basePayments[payer] = parseFloat((basePayments[payer] + payRemainder).toFixed(2))

  return { rate, baseAmount, baseSplits, basePayments }
}

/**
 * 從所有支出重算「每人參與分攤的支出筆數」memberExpenseCounts：{ uid: 筆數 }
 */
export const computeMemberExpenseCounts = (expenseDocs) => {
  const counts = {}
  expenseDocs.forEach(d => {
    const e = typeof d.data === 'function' ? d.data() : d
    Object.keys(e.splits || {}).forEach(uid => {
      counts[uid] = (counts[uid] || 0) + 1
    })
  })
  return counts
}

/**
 * 從所有支出（+ 結清紀錄、收入）重算 memberBalances
 * 收入是反向的支出：分得者 +splits、收款者 -received
 */
export const computeMemberBalances = (memberUids, expenseDocs, settlementDocs = [], incomeDocs = []) => {
  const balances = {}
  memberUids.forEach(uid => { balances[uid] = 0 })
  expenseDocs.forEach(d => {
    const e = typeof d.data === 'function' ? d.data() : d
    Object.entries(e.payments || {}).forEach(([uid, amt]) => {
      balances[uid] = (balances[uid] || 0) + amt
    })
    Object.entries(e.splits || {}).forEach(([uid, amt]) => {
      balances[uid] = (balances[uid] || 0) - amt
    })
  })
  settlementDocs.forEach(d => {
    const s = typeof d.data === 'function' ? d.data() : d
    balances[s.from] = (balances[s.from] || 0) + s.amount
    balances[s.to] = (balances[s.to] || 0) - s.amount
  })
  incomeDocs.forEach(d => {
    const i = typeof d.data === 'function' ? d.data() : d
    Object.entries(i.received || {}).forEach(([uid, amt]) => {
      balances[uid] = (balances[uid] || 0) - amt
    })
    Object.entries(i.splits || {}).forEach(([uid, amt]) => {
      balances[uid] = (balances[uid] || 0) + amt
    })
  })
  return balances
}

/**
 * 從所有支出（+ 結清紀錄、收入）重算群組彙總欄位：
 * totalAmount、totalExpenses、memberBalances、memberExpenseCounts、totalIncome、incomeCount
 * totalAmount 維持純支出；收入另計於 totalIncome／incomeCount
 */
export const computeGroupAggregates = (memberUids, expenseDocs, settlementDocs = [], incomeDocs = []) => ({
  totalAmount: expenseDocs.reduce((sum, d) => sum + (typeof d.data === 'function' ? d.data() : d).amount, 0),
  totalExpenses: expenseDocs.length,
  memberBalances: computeMemberBalances(memberUids, expenseDocs, settlementDocs, incomeDocs),
  memberExpenseCounts: computeMemberExpenseCounts(expenseDocs),
  totalIncome: incomeDocs.reduce((sum, d) => sum + (typeof d.data === 'function' ? d.data() : d).amount, 0),
  incomeCount: incomeDocs.length,
})
