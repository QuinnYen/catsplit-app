import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLedgerCsv, ledgerCsvFileName } from './csvExport.js'

const dict = {
  'ledger.csv.type': '類型', 'ledger.csv.date': '日期', 'ledger.csv.title': '標題', 'ledger.csv.category': '類別', 'ledger.csv.account': '帳戶',
  'ledger.csv.amount': '金額', 'ledger.csv.currency': '幣別', 'ledger.csv.baseAmount': '統計金額({currency})', 'ledger.csv.chargedAmount': '扣款金額',
  'ledger.csv.toAccount': '轉入帳戶', 'ledger.csv.toAmount': '轉入金額', 'ledger.csv.note': '備註', 'ledger.csv.source': '來源',
  'ledger.csv.srcManual': '手動', 'ledger.csv.srcGroup': '群組同步', 'ledger.csv.srcImported': '群組（已匯入）',
  'kind.expense': '支出', 'kind.income': '收入', 'ledger.kind.transfer': '轉帳', 'category.food': '餐飲', 'category.salary': '薪資',
}
const t = (k, p = {}) => (dict[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => p[n])
const ledger = { name: '大阪', baseCurrency: 'TWD' }
const accounts = [{ id: 'cash', name: '現金' }, { id: 'jp', name: '日圓現金' }, { id: 'snap_g', name: '日本行' }]
const ts = (ms) => ({ toMillis: () => ms })
const lines = (csv) => csv.slice(1).split('\n')

test('表頭與 BOM，統計金額帶統計幣別', () => {
  const csv = buildLedgerCsv({ ledger, accounts, transactions: [], t })
  assert.equal(csv.charCodeAt(0), 0xFEFF)
  assert.equal(lines(csv)[0], '"類型","日期","標題","類別","帳戶","金額","幣別","統計金額(TWD)","扣款金額","轉入帳戶","轉入金額","備註","來源"')
})

test('支出、跨幣別收入、轉帳各自的欄位；日期由舊到新，同一天依建立時間', () => {
  const transactions = [
    { id: '3', type: 'transfer', accountId: 'cash', toAccountId: 'jp', amount: 1000, currency: 'TWD', toAmount: 4800, date: '2026-11-03', createdAt: ts(1), source: { type: 'manual' } },
    { id: '2', type: 'expense', accountId: 'jp', amount: 980, currency: 'JPY', baseAmount: 210, accountAmount: 980, category: 'food', note: '拉麵', date: '2026-11-02', createdAt: ts(20), source: { type: 'manual' } },
    { id: '1', type: 'income', accountId: 'cash', amount: 100, currency: 'TWD', baseAmount: 100, category: 'salary', date: '2026-11-02', createdAt: ts(10), source: { type: 'manual' } },
  ]
  const rows = lines(buildLedgerCsv({ ledger, accounts, transactions, t })).slice(1)
  assert.deepEqual(rows, [
    '"收入","2026-11-02","","薪資","現金","100","TWD","100","","","","","手動"',
    '"支出","2026-11-02","","餐飲","日圓現金","980","JPY","210","980","","","拉麵","手動"',
    '"轉帳","2026-11-03","","","現金","1000","TWD","","","日圓現金","4800","","手動"',
  ])
})

test('群組同步與已匯入的來源標示、標題；帳戶已刪除時顯示 id', () => {
  const transactions = [
    { id: 'a', type: 'expense', accountId: 'snap_g', amount: 300, currency: 'TWD', baseAmount: 300, title: '拉麵', category: 'food', date: '2026-11-05', source: { type: 'group', groupId: 'g' } },
    { id: 'b', type: 'expense', accountId: 'gone', amount: 50, currency: 'TWD', baseAmount: 50, date: '2026-11-06', source: { type: 'group', groupId: 'g', detached: true } },
  ]
  const rows = lines(buildLedgerCsv({ ledger, accounts, transactions, t })).slice(1)
  assert.equal(rows[0], '"支出","2026-11-05","拉麵","餐飲","日本行","300","TWD","300","","","","","群組同步"')
  assert.equal(rows[1], '"支出","2026-11-06","","","gone","50","TWD","50","","","","","群組（已匯入）"')
})

test('文字欄位以公式字元開頭時補單引號，雙引號跳脫', () => {
  const transactions = [{ id: 'a', type: 'expense', accountId: 'cash', amount: 1, currency: 'TWD', baseAmount: 1, note: '=HYPERLINK("x")', title: '+1', date: '2026-11-01', source: { type: 'manual' } }]
  const row = lines(buildLedgerCsv({ ledger, accounts, transactions, t }))[1]
  assert.ok(row.includes('"\'+1"') && row.includes('"\'=HYPERLINK(""x"")"'))
})

test('檔名：帳本名稱＋日期', () => {
  assert.equal(ledgerCsvFileName(ledger, new Date(2026, 10, 5)), '大阪_20261105.csv')
})
