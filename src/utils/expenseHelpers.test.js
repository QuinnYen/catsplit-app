import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeSplits, applyExchangeRate, computeMemberBalances, computeMemberExpenseCounts, computeGroupAggregates, primaryPayer, payerLabel, buildPayments, matchExpense } from './expenseHelpers.js'

const sum = (obj) => Object.values(obj).reduce((s, v) => s + v, 0)
const members = [['a'], ['b'], ['c']]
const base = { effectiveUids: ['a', 'b', 'c'], allMemberEntries: members, shares: {}, percentages: {}, customAmounts: {} }

test('equal：整除時各人相同且總和等於總額', () => {
  const splits = computeSplits({ ...base, splitType: 'equal', totalAmount: 300 })
  assert.deepEqual(splits, { a: 100, b: 100, c: 100 })
})

test('equal：不整除時每人差距不超過 1 分，總和誤差不超過 0.01 × 人數', () => {
  const splits = computeSplits({ ...base, splitType: 'equal', totalAmount: 100 })
  assert.ok(Math.abs(sum(splits) - 100) <= 0.01 * 3)
})

test('subset：只分給有效成員', () => {
  const splits = computeSplits({ ...base, splitType: 'subset', totalAmount: 100, effectiveUids: ['a', 'b'] })
  assert.deepEqual(splits, { a: 50, b: 50 })
})

test('shares：依份數比例分攤', () => {
  const splits = computeSplits({ ...base, splitType: 'shares', totalAmount: 100, shares: { a: 1, b: 1, c: 2 } })
  assert.deepEqual(splits, { a: 25, b: 25, c: 50 })
})

test('percentage：依百分比分攤', () => {
  const splits = computeSplits({ ...base, splitType: 'percentage', totalAmount: 200, percentages: { a: 50, b: 30, c: 20 } })
  assert.deepEqual(splits, { a: 100, b: 60, c: 40 })
})

test('custom：使用自訂金額，未填者為 0', () => {
  const splits = computeSplits({ ...base, splitType: 'custom', totalAmount: 100, customAmounts: { a: '70', b: '30' } })
  assert.deepEqual(splits, { a: 70, b: 30, c: 0 })
})

test('applyExchangeRate：同幣別不換算', () => {
  const r = applyExchangeRate({ totalAmount: 100, splits: { a: 60, b: 40 }, payments: { a: 100 }, currency: 'TWD', baseCurrency: 'TWD', exchangeRate: 5 })
  assert.deepEqual(r, { rate: 1, baseAmount: 100, baseSplits: { a: 60, b: 40 }, basePayments: { a: 100 } })
})

test('applyExchangeRate：外幣依匯率換算總額與各人份額', () => {
  const r = applyExchangeRate({ totalAmount: 100, splits: { a: 60, b: 40 }, payments: { a: 100 }, currency: 'JPY', baseCurrency: 'TWD', exchangeRate: 0.22 })
  assert.deepEqual(r, { rate: 0.22, baseAmount: 22, baseSplits: { a: 13.2, b: 8.8 }, basePayments: { a: 22 } })
})

test('computeMemberBalances：付款人為正、分攤者為負，總和為 0', () => {
  const expenses = [{ payments: { a: 300 }, amount: 300, splits: { a: 100, b: 100, c: 100 } }]
  const balances = computeMemberBalances(['a', 'b', 'c'], expenses)
  assert.deepEqual(balances, { a: 200, b: -100, c: -100 })
  assert.equal(sum(balances), 0)
})

test('computeMemberBalances：結清紀錄會抵銷欠款', () => {
  const expenses = [{ payments: { a: 300 }, amount: 300, splits: { a: 100, b: 100, c: 100 } }]
  const settlements = [{ from: 'b', to: 'a', amount: 100 }]
  const balances = computeMemberBalances(['a', 'b', 'c'], expenses, settlements)
  assert.deepEqual(balances, { a: 100, b: 0, c: -100 })
})

test('computeMemberBalances：支援 Firestore 文件（有 data()）', () => {
  const doc = { data: () => ({ payments: { a: 100 }, amount: 100, splits: { a: 50, b: 50 } }) }
  assert.deepEqual(computeMemberBalances(['a', 'b'], [doc]), { a: 50, b: -50 })
})

test('尾差：100 元三人均分，尾差歸付款人，餘額總和為 0', () => {
  const splits = computeSplits({ ...base, splitType: 'equal', totalAmount: 100 })
  const { baseAmount, baseSplits } = applyExchangeRate({ totalAmount: 100, splits, payments: { b: 100 }, currency: 'TWD', baseCurrency: 'TWD' })
  assert.deepEqual(baseSplits, { a: 33.33, b: 33.34, c: 33.33 })
  assert.equal(parseFloat(sum(baseSplits).toFixed(2)), baseAmount)
  const balances = computeMemberBalances(['a', 'b', 'c'], [{ payments: { b: baseAmount }, amount: baseAmount, splits: baseSplits }])
  assert.equal(parseFloat(sum(balances).toFixed(2)), 0)
})

test('尾差：付款人不在分攤名單時歸第一位成員', () => {
  const { baseSplits } = applyExchangeRate({ totalAmount: 100, splits: { a: 33.33, b: 33.33, c: 33.33 }, payments: { x: 100 }, currency: 'TWD', baseCurrency: 'TWD' })
  assert.deepEqual(baseSplits, { a: 33.34, b: 33.33, c: 33.33 })
})

test('尾差：外幣換算後各人四捨五入的差額也歸付款人', () => {
  const { baseAmount, baseSplits } = applyExchangeRate({ totalAmount: 100, splits: { a: 33.33, b: 33.33, c: 33.34 }, currency: 'JPY', baseCurrency: 'TWD', exchangeRate: 0.215, payments: { a: 100 } })
  assert.equal(parseFloat(sum(baseSplits).toFixed(2)), baseAmount)
})

test('尾差：分帳本身不平（差距過大）時不調整', () => {
  const { baseSplits } = applyExchangeRate({ totalAmount: 100, splits: { a: 50, b: 40 }, payments: { a: 100 }, currency: 'TWD', baseCurrency: 'TWD' })
  assert.deepEqual(baseSplits, { a: 50, b: 40 })
})

test('多人付款：餘額為各人出資減份額，總和為 0', () => {
  const expenses = [{ payments: { a: 500, b: 200 }, amount: 700, splits: { a: 700 / 3, b: 700 / 3, c: 700 / 3 } }]
  const balances = computeMemberBalances(['a', 'b', 'c'], expenses)
  assert.equal(parseFloat(balances.a.toFixed(2)), 266.67)
  assert.equal(parseFloat(balances.b.toFixed(2)), -33.33)
  assert.equal(parseFloat(balances.c.toFixed(2)), -233.33)
  assert.ok(Math.abs(sum(balances)) < 0.001)
})

test('多人付款：外幣換算後出資總和等於 baseAmount，尾差歸最大出資者', () => {
  const { baseAmount, basePayments } = applyExchangeRate({ totalAmount: 100, splits: { a: 50, b: 50 }, payments: { a: 33.33, b: 66.67 }, currency: 'JPY', baseCurrency: 'TWD', exchangeRate: 0.215 })
  assert.equal(parseFloat(sum(basePayments).toFixed(2)), baseAmount)
})

test('多人付款：出資總和誤差 0.01 時仍會補平', () => {
  const { baseAmount, basePayments } = applyExchangeRate({ totalAmount: 100, splits: { a: 50, b: 50 }, payments: { a: 40, b: 59.99 }, currency: 'TWD', baseCurrency: 'TWD' })
  assert.deepEqual(basePayments, { a: 40, b: 60 })
  assert.equal(baseAmount, 100)
})

test('primaryPayer / payerLabel：單人顯示名字，多人顯示「等 N 人」', () => {
  const profiles = { a: { name: '小明' }, b: { name: '小華' } }
  assert.equal(primaryPayer({ a: 200, b: 500 }), 'b')
  assert.equal(payerLabel({ a: 100 }, profiles), '小明')
  assert.equal(payerLabel({ a: 200, b: 500 }, profiles), '小華 等 2 人')
})

test('matchExpense：提供 categoryText 時以它取代原始 category 比對', () => {
  assert.ok(matchExpense({ title: 'x', category: 'food' }, '餐飲', {}, '餐飲'))
  assert.ok(!matchExpense({ title: 'x', category: 'food' }, 'food', {}, '餐飲'))
  assert.ok(matchExpense({ title: 'x', category: '餐飲' }, '餐飲', {}))
})

test('matchExpense：可用任一付款人名字搜尋', () => {
  const profiles = { a: { name: '小明' }, b: { name: '小華' } }
  assert.ok(matchExpense({ title: '晚餐', payments: { a: 1, b: 2 } }, '小明', profiles))
  assert.ok(!matchExpense({ title: '晚餐', payments: { b: 2 } }, '小明', profiles))
})

test('buildPayments：單人付款為全額，多人付款略過空白與 0', () => {
  assert.deepEqual(buildPayments({ multiPayer: false, paidBy: 'a', payerAmounts: {}, totalAmount: 300 }), { a: 300 })
  assert.deepEqual(buildPayments({ multiPayer: true, paidBy: 'a', payerAmounts: { a: '500', b: '200', c: '', d: '0' }, totalAmount: 700 }), { a: 500, b: 200 })
})

test('computeMemberExpenseCounts：只計入 splits 內有該成員的支出，支援 Firestore 文件', () => {
  const docs = [
    { splits: { a: 50, b: 50 } },
    { data: () => ({ splits: { a: 100 } }) },
    { splits: {} },
  ]
  assert.deepEqual(computeMemberExpenseCounts(docs), { a: 2, b: 1 })
})

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// 群組彙總重算：收支平衡的 fixture（每筆 splits 總和 = payments 總和）
const aggExpenses = [
  { amount: 300, payments: { a: 300 }, splits: { a: 100, b: 100, c: 100 } },
  { amount: 22.5, payments: { b: 10.5, c: 12 }, splits: { a: 7.5, b: 7.5, c: 7.5 } },
]
const aggSettlements = [{ from: 'b', to: 'a', amount: 50 }]

test('computeGroupAggregates：空群組全為 0', () => {
  assert.deepEqual(computeGroupAggregates(['a', 'b'], []), {
    totalAmount: 0, totalExpenses: 0, memberBalances: { a: 0, b: 0 }, memberExpenseCounts: {}, totalIncome: 0, incomeCount: 0,
  })
})

test('computeGroupAggregates：單筆支出', () => {
  const r = computeGroupAggregates(['a', 'b', 'c'], [aggExpenses[0]])
  assert.equal(r.totalAmount, 300)
  assert.equal(r.totalExpenses, 1)
  assert.deepEqual(r.memberBalances, { a: 200, b: -100, c: -100 })
  assert.deepEqual(r.memberExpenseCounts, { a: 1, b: 1, c: 1 })
})

test('computeGroupAggregates：多筆含結清，餘額總和為 0', () => {
  const r = computeGroupAggregates(['a', 'b', 'c'], aggExpenses, aggSettlements)
  assert.equal(r.totalAmount, 322.5)
  assert.equal(r.totalExpenses, 2)
  assert.deepEqual(r.memberBalances, computeMemberBalances(['a', 'b', 'c'], aggExpenses, aggSettlements))
  assert.ok(Math.abs(sum(r.memberBalances)) < 1e-9)
})

test('computeGroupAggregates：Firestore 文件與純物件可混用', () => {
  const docs = [{ data: () => aggExpenses[0] }, aggExpenses[1]]
  const setDocs = [{ data: () => aggSettlements[0] }]
  assert.deepEqual(computeGroupAggregates(['a', 'b', 'c'], docs, setDocs), computeGroupAggregates(['a', 'b', 'c'], aggExpenses, aggSettlements))
})

test('computeGroupAggregates：不傳收入時 totalIncome、incomeCount 為 0，其餘欄位不變', () => {
  const r = computeGroupAggregates(['a', 'b', 'c'], aggExpenses, aggSettlements)
  assert.equal(r.totalIncome, 0)
  assert.equal(r.incomeCount, 0)
  assert.deepEqual(r.memberBalances, computeMemberBalances(['a', 'b', 'c'], aggExpenses, aggSettlements))
  assert.equal(r.totalAmount, 322.5)
})

test('computeGroupAggregates：新增收入的增量等於 computeMemberBalances 只算該收入（AC5）', () => {
  const members = ['a', 'b', 'c']
  const incomes = [{ amount: 900, received: { a: 600, b: 300 }, splits: { a: 225, b: 225, c: 450 } }]
  const before = computeGroupAggregates(members, aggExpenses, aggSettlements)
  const after = computeGroupAggregates(members, aggExpenses, aggSettlements, incomes)
  const delta = computeMemberBalances([], [], [], incomes)
  const keys = new Set([...Object.keys(after.memberBalances), ...Object.keys(before.memberBalances), ...Object.keys(delta)])
  keys.forEach(k => {
    assert.ok(near((after.memberBalances[k] ?? 0) - (before.memberBalances[k] ?? 0), delta[k] ?? 0), k)
  })
  assert.ok(near(after.totalIncome - before.totalIncome, 900))
  assert.equal(after.incomeCount - before.incomeCount, 1)
  assert.equal(after.totalAmount, before.totalAmount)
})

// SettlePage 原本手寫的餘額迴圈（原樣保留當 oracle），用來確認改用 computeMemberBalances 不改變結果與 key 順序
const legacySettleBalance = (memberUids, expensesData, settlementsData) => {
  const balance = {}
  memberUids.forEach(uid => { balance[uid] = 0 })
  expensesData.forEach(expense => {
    Object.entries(expense.payments || {}).forEach(([uid, amt]) => {
      balance[uid] = (balance[uid] || 0) + amt
    })
    Object.entries(expense.splits || {}).forEach(([uid, amt]) => {
      balance[uid] = (balance[uid] || 0) - amt
    })
  })
  settlementsData.forEach(s => {
    balance[s.from] = (balance[s.from] || 0) + s.amount
    balance[s.to] = (balance[s.to] || 0) - s.amount
  })
  return balance
}

test('computeMemberBalances：與 SettlePage 舊迴圈結果與 key 順序完全相同', () => {
  const expenses = [
    ...aggExpenses,
    { amount: 40, payments: { d: 40 }, splits: { d: 20, a: 20 } }, // d 不在 members 內
  ]
  const members = ['c', 'a', 'b']
  assert.deepStrictEqual(
    Object.entries(computeMemberBalances(members, expenses, aggSettlements)),
    Object.entries(legacySettleBalance(members, expenses, aggSettlements)),
  )
})

test('computeMemberBalances：A 付 100、A/B 均分，B 轉 50 給 A 後兩人餘額皆為 0', () => {
  const expenses = [{ amount: 100, payments: { a: 100 }, splits: { a: 50, b: 50 } }]
  assert.deepEqual(computeMemberBalances(['a', 'b'], expenses, [{ from: 'b', to: 'a', amount: 50 }]), { a: 0, b: 0 })
})

// 收入：反向的支出，balance += splits - received

test('computeMemberBalances：退款 1000 由 A 收到、A/B 均分 → A -500、B +500', () => {
  const b = computeMemberBalances(['a', 'b'], [], [], [{ received: { a: 1000 }, splits: { a: 500, b: 500 } }])
  assert.ok(near(b.a, -500) && near(b.b, 500))
})

test('computeMemberBalances：支出加退款，等同 A 付 2000、兩人均分', () => {
  const expenses = [{ amount: 3000, payments: { a: 3000 }, splits: { a: 1500, b: 1500 } }]
  const incomes = [{ received: { a: 1000 }, splits: { a: 500, b: 500 } }]
  const merged = computeMemberBalances(['a', 'b'], expenses, [], incomes)
  const expected = computeMemberBalances(['a', 'b'], [{ amount: 2000, payments: { a: 2000 }, splits: { a: 1000, b: 1000 } }])
  assert.ok(near(merged.a, expected.a) && near(merged.b, expected.b))
})

test('computeMemberBalances：多人收款、依份數分配，總和為 0', () => {
  const splits = computeSplits({ ...base, splitType: 'shares', totalAmount: 900, shares: { a: 1, b: 1, c: 2 } })
  const b = computeMemberBalances(['a', 'b', 'c'], [], [], [{ received: { a: 600, b: 300 }, splits }])
  assert.ok(near(b.a, -375) && near(b.b, -75) && near(b.c, 450))
  assert.ok(near(sum(b), 0))
})

test('computeMemberBalances：多幣別收入，尾差歸收款人，餘額總和為 0', () => {
  const splits = computeSplits({ ...base, splitType: 'equal', totalAmount: 1000 })
  const { baseAmount, baseSplits, basePayments } = applyExchangeRate({ totalAmount: 1000, splits, payments: { b: 1000 }, currency: 'JPY', baseCurrency: 'TWD', exchangeRate: 0.215 })
  assert.ok(near(baseAmount, 215))
  assert.ok(near(sum(baseSplits), 215) && near(sum(basePayments), 215))
  const b = computeMemberBalances(['a', 'b', 'c'], [], [], [{ received: basePayments, splits: baseSplits }])
  assert.ok(near(sum(b), 0))
  assert.ok(b.b < 0 && b.a > 0 && b.c > 0)
})

test('computeMemberBalances：不傳收入時結果不變（向下相容）', () => {
  const expenses = [{ payments: { a: 300 }, amount: 300, splits: { a: 100, b: 100, c: 100 } }]
  assert.deepStrictEqual(computeMemberBalances(['a', 'b', 'c'], expenses, []), computeMemberBalances(['a', 'b', 'c'], expenses, [], []))
})

test('computeMemberBalances：收入支援 Firestore 文件（有 data()）', () => {
  const doc = { data: () => ({ received: { a: 100 }, splits: { a: 50, b: 50 } }) }
  assert.deepEqual(computeMemberBalances(['a', 'b'], [], [], [doc]), { a: -50, b: 50 })
})
