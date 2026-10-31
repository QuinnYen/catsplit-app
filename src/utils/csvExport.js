// 群組明細匯出成 CSV（個人保存用）：明細區（支出、收入、轉帳依日期由舊到新）＋彙總區（群組總額與「我」的收支）。
// 金額一律是群組基準幣；付款人／收款人金額也是基準幣（資料本來就以基準幣儲存）。純函式，方便測試。
import { computeMemberBalances, toLocalDateStr, expenseTimeStr } from './expenseHelpers.js'
import { categoryLabel } from '../i18n/codes.js'

const BOM = String.fromCharCode(0xFEFF)
const round2 = (n) => Math.round(n * 100) / 100
const sum = (list, pick) => round2(list.reduce((s, x) => s + (pick(x) || 0), 0))

// 文字欄位以 = + - @ 開頭時，Excel 會當公式執行；前面補 ' 使其視為純文字（數字不處理）
export const escapeCell = (v) => {
  const s = String(v)
  return `"${(typeof v === 'string' && /^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`
}

const millis = (item) => item.createdAt?.toMillis?.() ?? 0

/**
 * @param {object} p
 * @param {object[]} p.expenses 支出文件（含 id）
 * @param {object[]} p.incomes 收入文件
 * @param {object[]} p.settlements 轉帳（結清）文件
 * @param {object} p.group 群組（用到 baseCurrency、memberProfiles）
 * @param {string} p.uid 目前使用者（訪客為其成員 id）
 * @param {Function} p.t 翻譯函式
 * @returns {string} 含 BOM 的 CSV 文字
 */
export const buildCsv = ({ expenses, incomes, settlements, group, uid, t }) => {
  const nameOf = (id) => group.memberProfiles?.[id]?.name || id
  const people = (amounts) => Object.entries(amounts || {}).map(([id, amt]) => `${nameOf(id)}(${amt})`).join('; ')
  const splitTypes = {
    equal: t('csv.split.equal'), subset: t('csv.split.subset'), shares: t('csv.split.shares'),
    percentage: t('csv.split.percentage'), custom: t('csv.split.custom'),
  }

  const header = [
    t('csv.type'), t('csv.date'), t('csv.time'), t('csv.title'), t('csv.category'), t('csv.payer'), t('csv.receiver'),
    t('csv.amount', { currency: group.baseCurrency }), t('csv.splitType'), t('csv.myShare'), t('csv.note'),
  ]

  const items = [
    ...expenses.map(doc => ({ doc, type: 'expense' })),
    ...incomes.map(doc => ({ doc, type: 'income' })),
    ...settlements.map(doc => ({ doc, type: 'settlement' })),
  ].sort((a, b) => millis(a.doc) - millis(b.doc))

  const rows = items.map(({ doc: d, type }) => {
    const date = d.createdAt?.toDate ? toLocalDateStr(d.createdAt.toDate()) : ''
    if (type === 'settlement') {
      return [t('csv.typeTransfer'), date, '', '', '', nameOf(d.from), nameOf(d.to), d.amount, '', '', d.note || '']
    }
    return [
      type === 'income' ? t('csv.typeIncome') : t('csv.typeExpense'),
      date,
      expenseTimeStr(d),
      d.title || '',
      d.category ? categoryLabel(d.category, t) : '',
      type === 'expense' ? people(d.payments) : '',
      type === 'income' ? people(d.received) : '',
      d.amount,
      splitTypes[d.splitType] || d.splitType || '',
      d.splits?.[uid] ?? '',
      d.note || '',
    ]
  })

  const balance = round2(computeMemberBalances([uid], expenses, settlements, incomes)[uid] ?? 0)
  const summary = [
    [t('csv.sumExpense'), sum(expenses, e => e.amount)],
    ...(incomes.length ? [[t('csv.sumIncome'), sum(incomes, i => i.amount)]] : []),
    [t('csv.myPaid'), sum(expenses, e => e.payments?.[uid])],
    [t('csv.myExpenseShare'), sum(expenses, e => e.splits?.[uid])],
    ...(incomes.length ? [
      [t('csv.myReceived'), sum(incomes, i => i.received?.[uid])],
      [t('csv.myIncomeShare'), sum(incomes, i => i.splits?.[uid])],
    ] : []),
    ...(settlements.length ? [
      [t('csv.myTransferOut'), sum(settlements, s => (s.from === uid ? s.amount : 0))],
      [t('csv.myTransferIn'), sum(settlements, s => (s.to === uid ? s.amount : 0))],
    ] : []),
    [t('csv.myBalance'), balance],
  ]

  const lines = [header, ...rows, [''], [t('csv.summary')], ...summary]
  return BOM + lines.map(r => r.map(escapeCell).join(',')).join('\n')
}

// 沒有收入也沒有轉帳時維持原本的「支出明細」檔名
export const csvFileName = ({ group, incomes, settlements, t }) =>
  `${group.name}_${incomes.length || settlements.length ? t('csv.fileBoth') : t('csv.fileExpense')}.csv`
