import { test } from 'node:test'
import assert from 'node:assert/strict'
import zhTW from '../i18n/zh-TW.js'
import en from '../i18n/en.js'
import { translate } from '../i18n/core.js'
import { buildCsv, csvFileName, escapeCell } from './csvExport.js'

const DICTS = { 'zh-TW': zhTW, en }
const tz = (key, params) => translate(DICTS, 'zh-TW', key, params)
const te = (key, params) => translate(DICTS, 'en', key, params)

const at = (y, m, d, h = 0, min = 0) => ({ toDate: () => new Date(y, m - 1, d, h, min), toMillis: () => new Date(y, m - 1, d, h, min).getTime() })
const group = { name: '九州', baseCurrency: 'JPY', memberProfiles: { me: { name: '小明' }, u2: { name: '小華' } } }

const expenses = [
  // 外幣支出：payments、splits、amount 都是基準幣
  { id: 'e2', title: '機場接送', category: 'transport', currency: 'TWD', originalAmount: 3800, amount: 18297.92, payments: { u2: 18297.92 }, splits: { me: 9148.96, u2: 9148.96 }, splitType: 'equal', createdAt: at(2026, 10, 25, 9, 30), hasTime: true },
  { id: 'e1', title: '=SUM(A1)', category: 'food', amount: 1000, payments: { me: 600, u2: 400 }, splits: { me: 500, u2: 500 }, splitType: 'equal', note: '晚餐', createdAt: at(2026, 10, 6, 11, 47), hasTime: true },
]
const incomes = [{ id: 'i1', title: '退款', category: 'refund', amount: 200, received: { u2: 200 }, splits: { me: 100, u2: 100 }, splitType: 'equal', createdAt: at(2026, 10, 10) }]
const settlements = [{ id: 's1', from: 'u2', to: 'me', amount: 300, note: '現金', createdAt: at(2026, 10, 30) }]

const parse = (csv) => csv.replace(String.fromCharCode(0xFEFF), '').split('\n').map(line => line.slice(1, -1).split('","'))

test('只有支出：明細由舊到新、欄位固定、不含收入與轉帳的彙總列', () => {
  const rows = parse(buildCsv({ expenses, incomes: [], settlements: [], group, uid: 'me', t: tz }))
  assert.deepEqual(rows[0], ['類型', '日期', '時間', '標題', '類別', '付款人', '收款人', '金額(JPY)', '分帳方式', '我的分攤', '備註'])
  assert.deepEqual(rows[1], ['支出', '2026-10-06', '11:47', "'=SUM(A1)", '餐飲', '小明(600); 小華(400)', '', '1000', '均分', '500', '晚餐'])
  assert.deepEqual(rows[2].slice(0, 8), ['支出', '2026-10-25', '09:30', '機場接送', '交通', '小華(18297.92)', '', '18297.92'])
  const labels = rows.slice(4).map(r => r[0])
  assert.deepEqual(labels, ['彙總', '群組總支出', '我支出已付', '我支出應分攤', '我的淨餘額'])
})

test('收入與轉帳：加入明細與彙總，淨餘額與 computeMemberBalances 一致', () => {
  const rows = parse(buildCsv({ expenses, incomes, settlements, group, uid: 'me', t: tz }))
  const detail = rows.slice(1, 5)
  assert.deepEqual(detail.map(r => r[0]), ['支出', '收入', '支出', '轉帳']) // 依日期：10/6 支出、10/10 收入、10/25 支出、10/30 轉帳
  assert.deepEqual(detail[1].slice(5, 10), ['', '小華(200)', '200', '均分', '100'])
  assert.deepEqual(detail[3], ['轉帳', '2026-10-30', '', '', '', '小華', '小明', '300', '', '', '現金'])
  const summary = Object.fromEntries(rows.slice(7).map(r => [r[0], r[1]]))
  // 我：支出已付 600、應分攤 500+9148.96；收入已收 0、應分得 100；轉帳轉入 300
  assert.equal(summary['我支出已付'], '600')
  assert.equal(summary['我支出應分攤'], '9648.96')
  assert.equal(summary['我收入應分得'], '100')
  assert.equal(summary['我轉帳轉入'], '300')
  // 600 - 9648.96 - 0 + 100 + 0 - 300
  assert.equal(summary['我的淨餘額'], '-9248.96')
})

test('訪客以成員 id 當 uid；沒有分攤時「我的分攤」留空', () => {
  const rows = parse(buildCsv({ expenses, incomes: [], settlements: [], group, uid: 'nobody', t: tz }))
  assert.equal(rows[1][9], '')
})

test('英文介面欄位標題；沒有明細外的資料時檔名維持支出明細', () => {
  const rows = parse(buildCsv({ expenses, incomes: [], settlements: [], group, uid: 'me', t: te }))
  assert.equal(rows[0][0], 'Type')
  assert.equal(csvFileName({ group, incomes: [], settlements: [], t: tz }), '九州_支出明細.csv')
  assert.equal(csvFileName({ group, incomes, settlements: [], t: tz }), '九州_收支明細.csv')
  assert.equal(csvFileName({ group, incomes: [], settlements, t: tz }), '九州_收支明細.csv')
})

test('escapeCell：公式開頭補單引號、雙引號跳脫、數字不處理', () => {
  assert.equal(escapeCell('=1+1'), `"'=1+1"`)
  assert.equal(escapeCell('a"b'), '"a""b"')
  assert.equal(escapeCell(-5), '"-5"')
})
