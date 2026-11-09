import { computeMemberBalances, realIncomes } from './expenseHelpers.js'

// 結算頁「某人的餘額怎麼來」：各來源分開算，加總等於 computeMemberBalances 的合計淨額（金額皆為群組基準幣別）。
// paid／owes 只算支出；settled 為已結清轉帳（付出為正、收到為負）；income 為退款等收入；sponsor 為贊助（收到為正、給出為負）。
export const buildPersonBreakdown = (uid, { expenses, settlements, incomes }) => {
  const only = (e, s, i) => computeMemberBalances([uid], e, s, i)[uid]
  const paid = expenses.reduce((sum, e) => sum + (e.payments?.[uid] || 0), 0)
  const owes = expenses.reduce((sum, e) => sum + (e.splits?.[uid] || 0), 0)
  const settled = only([], settlements, [])
  const income = only([], [], realIncomes(incomes))
  const sponsor = only([], [], incomes.filter(i => i.isSponsorship))
  return { paid, owes, settled, income, sponsor, net: paid - owes + settled + income + sponsor }
}
