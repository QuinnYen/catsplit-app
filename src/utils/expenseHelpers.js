export const toLocalDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const todayStr = () => toLocalDateStr(new Date())

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
 * 套用匯率，回傳 baseAmount 與 baseSplits
 */
export const applyExchangeRate = ({ totalAmount, splits, currency, baseCurrency, exchangeRate }) => {
  const rate = currency === baseCurrency ? 1 : (exchangeRate ?? 1)
  const baseAmount = currency === baseCurrency ? totalAmount : parseFloat((totalAmount * rate).toFixed(2))
  const baseSplits = Object.fromEntries(
    Object.entries(splits).map(([uid, v]) => [uid, currency === baseCurrency ? v : parseFloat((v * rate).toFixed(2))])
  )
  return { rate, baseAmount, baseSplits }
}

/**
 * 從所有支出（+ 結清紀錄）重算 memberBalances
 */
export const computeMemberBalances = (memberUids, expenseDocs, settlementDocs = []) => {
  const balances = {}
  memberUids.forEach(uid => { balances[uid] = 0 })
  expenseDocs.forEach(d => {
    const e = typeof d.data === 'function' ? d.data() : d
    balances[e.paidBy] = (balances[e.paidBy] || 0) + e.amount
    Object.entries(e.splits || {}).forEach(([uid, amt]) => {
      balances[uid] = (balances[uid] || 0) - amt
    })
  })
  settlementDocs.forEach(d => {
    const s = typeof d.data === 'function' ? d.data() : d
    balances[s.from] = (balances[s.from] || 0) + s.amount
    balances[s.to] = (balances[s.to] || 0) - s.amount
  })
  return balances
}
