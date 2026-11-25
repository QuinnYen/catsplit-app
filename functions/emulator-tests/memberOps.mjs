// memberOps.js 的 Firestore 整合測試：群組搬移、轉帳自付、個人資料搬移、重試安全、合併預覽。
// 需要 Firestore 模擬器，用 npm run test:merge 執行（不屬於 npm test，檔名刻意不符合 *.test.js）。
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import {
  migrateMember, migrateAllGroups, findGroupsOf, listPersonalConflicts, movePersonalData, buildMergePreview,
} from '../memberOps.js'
import { buildResolutions } from '../merge.js'
import { computeGroupAggregates } from '../../src/utils/expenseHelpers.js'

let db
before(() => {
  initializeApp({ projectId: 'demo-catsplit-merge' })
  db = getFirestore()
})

const KEEP = 'U' + 'a'.repeat(32)
const DROP = 'u_00000000000000000001'
const THIRD = 'U' + 'c'.repeat(32)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const seedGroup = async (id, { members, createdBy, profiles, expenses = [], settlements = [], incomes = [] }) => {
  const ref = db.doc(`groups/${id}`)
  const toDocs = (list) => list.map((d, i) => ({ data: () => d, id: `${i}` }))
  const agg = computeGroupAggregates(members, toDocs(expenses), toDocs(settlements), toDocs(incomes))
  await ref.set({
    name: `Group ${id}`, baseCurrency: 'TWD', createdBy, members,
    memberProfiles: Object.fromEntries(members.map((m) => [m, profiles?.[m] ?? { name: `N-${m.slice(0, 4)}` }])),
    ...agg,
  })
  for (const [col, list] of [['expenses', expenses], ['settlements', settlements], ['incomes', incomes]]) {
    for (const [i, d] of list.entries()) await ref.collection(col).doc(`${col[0]}${i + 1}`).set(d)
  }
}
const readCol = async (groupId, col) => Object.fromEntries((await db.collection(`groups/${groupId}/${col}`).get()).docs.map((d) => [d.id, d.data()]))

// ---------- 群組搬移 ----------

const seedGroups = async () => {
  // g1：兩邊都在，建立者是被併入帳號，含轉帳（KEEP→DROP 會變成自己轉給自己）
  await seedGroup('g1', {
    members: [KEEP, DROP, THIRD], createdBy: DROP,
    expenses: [
      { amount: 90, payments: { [DROP]: 90 }, splits: { [KEEP]: 30, [DROP]: 30, [THIRD]: 30 }, shares: { [DROP]: 1, [KEEP]: 1 }, createdBy: DROP },
      { amount: 60, payments: { [KEEP]: 40, [THIRD]: 20 }, splits: { [KEEP]: 20, [DROP]: 20, [THIRD]: 20 }, createdBy: KEEP },
    ],
    settlements: [
      { from: KEEP, to: DROP, amount: 20, settledBy: KEEP },
      { from: DROP, to: THIRD, amount: 10, settledBy: DROP },
      { from: THIRD, to: KEEP, amount: 5, settledBy: THIRD },
    ],
    incomes: [{ amount: 30, received: { [DROP]: 30 }, splits: { [KEEP]: 10, [DROP]: 10, [THIRD]: 10 }, createdBy: DROP }],
  })
  // g2：只有被併入帳號在
  await seedGroup('g2', {
    members: [DROP, THIRD], createdBy: THIRD, profiles: { [DROP]: { name: 'Drop Name', avatar: null } },
    expenses: [{ amount: 50, payments: { [THIRD]: 50 }, splits: { [DROP]: 25, [THIRD]: 25 }, createdBy: THIRD }],
    settlements: [{ from: DROP, to: THIRD, amount: 3, settledBy: DROP }],
  })
  // g3：只有保留帳號在，必須完全不動
  await seedGroup('g3', {
    members: [KEEP, THIRD], createdBy: KEEP,
    expenses: [{ amount: 8, payments: { [KEEP]: 8 }, splits: { [KEEP]: 4, [THIRD]: 4 }, createdBy: KEEP }],
  })
}

test('以 uid 反查所屬群組', async () => {
  await seedGroups()
  assert.deepEqual((await findGroupsOf(db, DROP)).map((g) => g.id).sort(), ['g1', 'g2'])
  assert.deepEqual((await findGroupsOf(db, KEEP)).map((g) => g.id).sort(), ['g1', 'g3'])
  assert.deepEqual(await findGroupsOf(db, 'U' + 'z'.repeat(32)), [])
})

test('合併預覽（不寫入）：兩邊都在與只有被併入帳號在的群組、帳目筆數、自己轉給自己的轉帳', async () => {
  const before = (await db.doc('groups/g1').get()).data()
  const p = await buildMergePreview(db, KEEP, DROP)
  // 群組數一樣多（各 2 個）→ 保留第一個參數
  assert.equal(p.keepUid, KEEP)
  assert.equal(p.dropUid, DROP)
  assert.deepEqual(p.groups.bothIn.map((g) => g.id), ['g1'])
  assert.deepEqual(p.groups.dropOnly.map((g) => g.id), ['g2'])
  // g1 的 e1、e2（兩筆都有 DROP）、s1、s2、i1，加上 g2 的 e1、s1
  assert.deepEqual(p.impact, { expenses: 3, settlements: 3, incomes: 1, selfTransfers: 1 })
  assert.equal(p.personal.docCount, 0)
  assert.deepEqual((await db.doc('groups/g1').get()).data(), before)
  assert.equal((await readCol('g1', 'settlements')).s1.from, KEEP)
})

test('合併預覽：群組較多的帳號保留，與參數順序無關', async () => {
  const P1 = 'U' + '1'.repeat(32)
  const P2 = 'u_00000000000000000002'
  await seedGroup('p1', { members: [P1], createdBy: P1 })
  await seedGroup('p2', { members: [P1], createdBy: P1 })
  await seedGroup('p3', { members: [P1, P2], createdBy: P1, settlements: [{ from: P1, to: P2, amount: 1, settledBy: P1 }] })
  await seedGroup('p4', { members: [P2], createdBy: P2, expenses: [{ amount: 5, payments: { [P2]: 5 }, splits: { [P2]: 5 }, createdBy: P2 }] })
  for (const [a, b] of [[P1, P2], [P2, P1]]) {
    const p = await buildMergePreview(db, a, b)
    assert.equal(p.keepUid, P1)
    assert.equal(p.dropUid, P2)
    assert.deepEqual(p.groups.bothIn.map((g) => g.id), ['p3'])
    assert.deepEqual(p.groups.dropOnly.map((g) => g.id), ['p4'])
    assert.deepEqual(p.impact, { expenses: 1, settlements: 1, incomes: 0, selfTransfers: 1 })
  }
})

test('migrateAllGroups：兩邊都在的群組金額相加、自己轉給自己的轉帳被刪、建立者轉移、其他群組不動', async () => {
  const g3Before = (await db.doc('groups/g3').get()).data()
  const result = await migrateAllGroups(db, KEEP, DROP)
  assert.deepEqual(result.migrated.sort(), ['g1', 'g2'])
  assert.deepEqual(result.failed, [])

  // g1：兩邊都在
  const g1 = (await db.doc('groups/g1').get()).data()
  assert.deepEqual([...g1.members].sort(), [KEEP, THIRD].sort())
  assert.equal(g1.createdBy, KEEP)
  assert.ok(!(DROP in g1.memberProfiles) && KEEP in g1.memberProfiles)
  assert.ok(!(DROP in g1.memberBalances) && !(DROP in g1.memberExpenseCounts))

  const exp = await readCol('g1', 'expenses')
  assert.deepEqual(exp.e1.payments, { [KEEP]: 90 })
  assert.deepEqual(exp.e1.splits, { [KEEP]: 60, [THIRD]: 30 })
  assert.deepEqual(exp.e1.shares, { [KEEP]: 2 })
  assert.equal(exp.e1.createdBy, KEEP)
  assert.deepEqual(exp.e2.splits, { [KEEP]: 40, [THIRD]: 20 })

  const sets = await readCol('g1', 'settlements')
  assert.ok(!('s1' in sets), 'KEEP→DROP 變成自己轉給自己，應被刪除')
  assert.deepEqual([sets.s2.from, sets.s2.to, sets.s2.settledBy], [KEEP, THIRD, KEEP])
  assert.deepEqual([sets.s3.from, sets.s3.to], [THIRD, KEEP])

  const inc = await readCol('g1', 'incomes')
  assert.deepEqual(inc.i1.received, { [KEEP]: 30 })
  assert.deepEqual(inc.i1.splits, { [KEEP]: 20, [THIRD]: 10 })

  // 兩個帳號都參與的支出只算一筆：e1、e2 都有 KEEP，所以是 2，不是兩邊筆數相加的 4
  assert.equal(g1.memberExpenseCounts[KEEP], 2)
  assert.equal(g1.memberExpenseCounts[THIRD], 2)

  // 群組上存的餘額與筆數，等於以搬移後的文件重新計算的結果（刪掉自付轉帳不影響餘額）
  const toDocs = (o) => Object.values(o).map((d) => ({ data: () => d }))
  const recomputed = computeGroupAggregates(g1.members, toDocs(exp), toDocs(sets), toDocs(inc))
  for (const uid of g1.members) {
    assert.ok(Math.abs(g1.memberBalances[uid] - recomputed.memberBalances[uid]) < 0.005, `${uid}: ${g1.memberBalances[uid]} vs ${recomputed.memberBalances[uid]}`)
    assert.equal(g1.memberExpenseCounts[uid] ?? 0, recomputed.memberExpenseCounts[uid] ?? 0)
  }

  // g2：只有被併入帳號在，成員身分直接改成保留帳號，名字沿用
  const g2 = (await db.doc('groups/g2').get()).data()
  assert.deepEqual(g2.members, [KEEP, THIRD])
  assert.equal(g2.memberProfiles[KEEP].name, 'Drop Name')
  assert.ok(!(DROP in g2.memberProfiles))
  const g2sets = await readCol('g2', 'settlements')
  assert.deepEqual([g2sets.s1.from, g2sets.s1.to], [KEEP, THIRD])

  // g3 完全沒動
  assert.deepEqual((await db.doc('groups/g3').get()).data(), g3Before)
})

test('重複執行安全：已搬完的群組略過，被併入帳號不再屬於任何群組', async () => {
  const again = await migrateAllGroups(db, KEEP, DROP)
  assert.deepEqual(again, { migrated: [], failed: [] })
  assert.equal(await migrateMember(db, 'g1', DROP, KEEP), false)
  assert.deepEqual(await findGroupsOf(db, DROP), [])
})

test('斷點續跑：帳目已改完、群組文件還沒更新時重跑，結果正確', async () => {
  // 模擬上次中途失敗：支出已改成 KEEP、自付轉帳已刪，但 members 仍含 DROP、餘額尚未合併
  await db.doc('groups/g5').set({
    name: 'G5', baseCurrency: 'TWD', createdBy: DROP, members: [KEEP, DROP],
    memberProfiles: { [KEEP]: { name: 'K' }, [DROP]: { name: 'D' } },
    memberBalances: { [KEEP]: 10, [DROP]: -4.5 }, memberExpenseCounts: { [KEEP]: 1, [DROP]: 2 },
  })
  await db.doc('groups/g5/expenses/e1').set({ amount: 10, payments: { [KEEP]: 10 }, splits: { [KEEP]: 10 }, createdBy: KEEP })
  assert.equal(await migrateMember(db, 'g5', DROP, KEEP), true)
  const g5 = (await db.doc('groups/g5').get()).data()
  assert.deepEqual(g5.members, [KEEP])
  assert.equal(g5.createdBy, KEEP)
  assert.deepEqual(g5.memberBalances, { [KEEP]: 5.5 })
  // 兩邊都在群組，筆數以文件重算：只有一筆支出（KEEP 參與分攤），不是 1 + 2
  assert.deepEqual(g5.memberExpenseCounts, { [KEEP]: 1 })
  assert.deepEqual((await readCol('g5', 'expenses')).e1.payments, { [KEEP]: 10 })
})

// ---------- 個人資料 ----------

// 以後綴區分每一組測試用的帳號，避免互相干擾
const seedPersonal = async (suffix, { keepProfileFirst = true } = {}) => {
  const keep = `U${suffix.repeat(32)}`
  const drop = `u_${suffix.repeat(20)}`
  const u = (uid, path) => db.doc(`users/${uid}/${path}`)
  await db.doc(`users/${keep}`).set({ name: 'K' })
  await db.doc(`users/${drop}`).set({ name: 'D', provider: 'google' })
  await u(keep, 'paymentMethods/pmK').set({ providerId: 'bank', value: '111' })
  await u(drop, 'paymentMethods/pmD').set({ providerId: 'line', value: '222' })
  await u(drop, 'spendMethods/sm1').set({ name: 'card', type: 'credit' })
  await u(drop, 'savingsGoals/sg1').set({ title: 'trip', targetAmount: 1000, currency: 'TWD' })
  await u(drop, 'savingsGoals/sg1/entries/en1').set({ type: 'save', amount: 100, title: 'a', date: '2026-11-01' })
  await u(drop, 'savingsGoals/sg1/entries/en2').set({ type: 'save', amount: 50, title: 'b', date: '2026-11-02' })
  // 本身不存在、只有子集合的文件（listDocuments 會列出，但 get().exists 為 false）
  await u(drop, 'savingsGoals/ghost/entries/enGhost').set({ type: 'save', amount: 1, title: 'g', date: '2026-11-03' })
  // 暱稱：寫入較晚的那份較新
  const first = keepProfileFirst ? keep : drop
  const second = keepProfileFirst ? drop : keep
  await u(first, 'settings/profile').set({ nickname: first === keep ? 'KeepNick' : 'DropNick' })
  await sleep(20)
  await u(second, 'settings/profile').set({ nickname: second === keep ? 'KeepNick' : 'DropNick' })
  // oaPrompt：keep 較新
  await u(drop, 'settings/oaPrompt').set({ promptedAt: Timestamp.fromMillis(1000) })
  await sleep(20)
  await u(keep, 'settings/oaPrompt').set({ promptedAt: Timestamp.fromMillis(2000) })
  return { keep, drop, u }
}

test('列出個人資料與衝突：只有固定 id 的文件會衝突，自動 id 的收款方式與儲蓄目標不會', async () => {
  const { keep, drop } = await seedPersonal('b')
  const { docCount, conflicts } = await listPersonalConflicts(db, keep, drop)
  // pmD、sm1、sg1、en1、en2、enGhost、settings/profile、settings/oaPrompt（不含 users/{uid} 本身與不存在的 ghost 文件）
  assert.equal(docCount, 8)
  assert.deepEqual(conflicts.map((c) => c.path).sort(), ['settings/oaPrompt', 'settings/profile'])
  const byPath = Object.fromEntries(conflicts.map((c) => [c.path, c]))
  assert.ok(byPath['settings/profile'].dropUpdatedMs > byPath['settings/profile'].keepUpdatedMs)
  // 暱稱衝突帶雙方暱稱，其他路徑不帶內容
  assert.deepEqual([byPath['settings/profile'].keepNickname, byPath['settings/profile'].dropNickname], ['KeepNick', 'DropNick'])
  assert.ok(!('keepNickname' in byPath['settings/oaPrompt']))
  assert.ok(byPath['settings/oaPrompt'].keepUpdatedMs > byPath['settings/oaPrompt'].dropUpdatedMs)

  const resolutions = buildResolutions(conflicts)
  // 暱稱要使用者決定，預設保留 keepUid（即使被併入帳號的較新）；oaPrompt 自動保留較新的
  assert.deepEqual(resolutions, { 'settings/profile': 'keep', 'settings/oaPrompt': 'keep' })
})

test('搬移個人資料：複製沒有衝突的文件，依選擇處理衝突，來源清空', async () => {
  const { keep, drop, u } = await seedPersonal('c')
  const { conflicts } = await listPersonalConflicts(db, keep, drop)
  // 使用者選擇暱稱用被併入帳號的；oaPrompt 用自動處理的結果（保留較新的）
  const resolutions = buildResolutions(conflicts, { 'settings/profile': 'drop' })
  const stats = await movePersonalData(db, keep, drop, resolutions)
  assert.deepEqual(stats, { copied: 6, overwritten: 1, skipped: 1 })

  assert.equal((await u(keep, 'paymentMethods/pmK').get()).data().value, '111')
  assert.equal((await u(keep, 'paymentMethods/pmD').get()).data().value, '222')
  assert.equal((await u(keep, 'spendMethods/sm1').get()).data().name, 'card')
  assert.equal((await u(keep, 'savingsGoals/sg1').get()).data().title, 'trip')
  assert.equal((await u(keep, 'savingsGoals/sg1/entries/en1').get()).data().amount, 100)
  assert.equal((await u(keep, 'savingsGoals/sg1/entries/en2').get()).data().amount, 50)
  assert.equal((await u(keep, 'savingsGoals/ghost/entries/enGhost').get()).data().amount, 1)
  assert.equal((await u(keep, 'settings/profile').get()).data().nickname, 'DropNick')
  assert.equal((await u(keep, 'settings/oaPrompt').get()).data().promptedAt.toMillis(), 2000)

  // 來源的子集合都清空，只剩 users/{drop} 本身（合併最後才與 Auth 一起刪）
  assert.deepEqual(await db.doc(`users/${drop}`).listCollections(), [])
  assert.equal((await db.doc(`users/${drop}`).get()).exists, true)
  // 保留帳號原本的文件沒被弄丟
  assert.equal((await db.doc(`users/${keep}`).get()).data().name, 'K')
})

test('搬移個人資料：使用者選保留自己的，被併入帳號的暱稱不會覆蓋', async () => {
  const { keep, drop, u } = await seedPersonal('d', { keepProfileFirst: false })
  const { conflicts } = await listPersonalConflicts(db, keep, drop)
  // 預設建議是保留 keepUid 的，這裡使用者也明確選 keep
  assert.equal(buildResolutions(conflicts)['settings/profile'], 'keep')
  const stats = await movePersonalData(db, keep, drop, buildResolutions(conflicts, { 'settings/profile': 'keep' }))
  assert.deepEqual(stats, { copied: 6, overwritten: 0, skipped: 2 })
  assert.equal((await u(keep, 'settings/profile').get()).data().nickname, 'KeepNick')
})

test('搬移個人資料：重複執行與中途失敗後重試都安全', async () => {
  const { keep, drop, u } = await seedPersonal('e')
  // 模擬上次已複製了一份、來源還沒刪（重試時看起來像衝突，但沒指定 resolution 就保留，資料相同）
  await u(keep, 'paymentMethods/pmD').set({ providerId: 'line', value: '222' })
  const { conflicts } = await listPersonalConflicts(db, keep, drop)
  assert.deepEqual(conflicts.map((c) => c.path).sort(), ['paymentMethods/pmD', 'settings/oaPrompt', 'settings/profile'])
  const resolutions = buildResolutions(conflicts.filter((c) => c.path.startsWith('settings/')), {})
  const first = await movePersonalData(db, keep, drop, resolutions)
  assert.deepEqual(first, { copied: 5, overwritten: 0, skipped: 3 }) // 暱稱預設保留 keepUid 的，不覆蓋
  assert.equal((await u(keep, 'paymentMethods/pmD').get()).data().value, '222')

  const second = await movePersonalData(db, keep, drop, resolutions)
  assert.deepEqual(second, { copied: 0, overwritten: 0, skipped: 0 })
  assert.deepEqual(await db.doc(`users/${drop}`).listCollections(), [])
})

test('不能合併訪客或相同的帳號', async () => {
  await assert.rejects(() => migrateAllGroups(db, KEEP, 'p_abc'), /guest_not_mergeable/)
  await assert.rejects(() => listPersonalConflicts(db, KEEP, KEEP), /same_uid/)
  await assert.rejects(() => movePersonalData(db, 'p_abc', DROP), /guest_not_mergeable/)
  await assert.rejects(() => buildMergePreview(db, KEEP, KEEP), /same_uid/)
})

test('搬移個人資料：雙方都有預設帳本時重算現金帳戶餘額，群組連結取較早的連結時間', async () => {
  const keep = KEEP, drop = DROP
  const ledger = (uid, id) => db.doc(`users/${uid}/ledgers/${id}`)
  const seedLedger = async (uid, id, balance, spent, txId) => {
    await ledger(uid, id).set({ name: id, baseCurrency: 'TWD' })
    await ledger(uid, id).collection('accounts').doc('cash').set({ name: '現金', type: 'cash', currency: 'TWD', initialBalance: 0, balance, kind: 'normal' })
    await ledger(uid, id).collection('transactions').doc(txId).set({ type: 'expense', accountId: 'cash', amount: spent, currency: 'TWD', baseAmount: spent, exchangeRate: 1, date: '2026-11-01', source: { type: 'manual' } })
  }
  await seedLedger(keep, 'default', -100, 100, 'k1')
  await seedLedger(drop, 'default', -50, 50, 'd1')
  await seedLedger(drop, 'trip', -30, 30, 't1') // 只有被併入帳號有的帳本，原樣搬過去
  await ledger(keep, 'default').collection('groupLinks').doc('g1').set({ groupName: 'KeepName', linkedAt: Timestamp.fromMillis(5000) })
  await ledger(drop, 'default').collection('groupLinks').doc('g1').set({ groupName: 'DropName', linkedAt: Timestamp.fromMillis(1000) })
  await ledger(drop, 'default').collection('groupLinks').doc('g2').set({ groupName: 'Only', linkedAt: Timestamp.fromMillis(2000) })

  await movePersonalData(db, keep, drop, {})

  const cash = (await ledger(keep, 'default').collection('accounts').doc('cash').get()).data()
  assert.equal(cash.balance, -150) // 重算：兩邊的帳目都計入
  assert.equal((await ledger(keep, 'default').collection('transactions').get()).size, 2)
  assert.equal((await ledger(keep, 'trip').collection('accounts').doc('cash').get()).data().balance, -30)
  const g1 = (await ledger(keep, 'default').collection('groupLinks').doc('g1').get()).data()
  assert.equal(g1.linkedAt.toMillis(), 1000)
  assert.equal(g1.groupName, 'KeepName')
  assert.equal((await ledger(keep, 'default').collection('groupLinks').doc('g2').get()).data().linkedAt.toMillis(), 2000)
  assert.deepEqual(await db.doc(`users/${drop}`).listCollections(), [])
})
