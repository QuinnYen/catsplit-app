import { test } from 'node:test'
import assert from 'node:assert/strict'
import zhTW from './zh-TW.js'
import en from './en.js'
import { translate } from './core.js'
import {
  WRITE_CODES, CATEGORY_CODES, PAYMENT_METHOD_CODES, ACTIVITY_TYPES,
  normalizeCategory, categoryLabel, categoryForWrite,
  normalizePaymentMethod, paymentMethodLabel, paymentMethodForWrite,
  activityForWrite, describeActivity,
} from './legacy.js'

const DICTS = { 'zh-TW': zhTW, en }
const tz = (key, params) => translate(DICTS, 'zh-TW', key, params)
const te = (key, params) => translate(DICTS, 'en', key, params)

test('代碼表：每個代碼在兩份字典都有對應的 key', () => {
  for (const code of CATEGORY_CODES) assert.ok(`category.${code}` in zhTW && `category.${code}` in en, code)
  for (const code of PAYMENT_METHOD_CODES) assert.ok(`payMethod.${code}` in zhTW && `payMethod.${code}` in en, code)
  for (const type of ACTIVITY_TYPES) assert.ok(`activity.${type}` in zhTW && `activity.${type}` in en, type)
})

test('normalizeCategory：舊中文標籤轉代碼，空值為 other，自訂分類與代碼原樣保留', () => {
  assert.equal(normalizeCategory('餐飲'), 'food')
  assert.equal(normalizeCategory('日用品'), 'daily')
  assert.equal(normalizeCategory('退款'), 'refund')
  assert.equal(normalizeCategory('預收款'), 'advance')
  assert.equal(normalizeCategory('其他'), 'other')
  assert.equal(normalizeCategory(''), 'other')
  assert.equal(normalizeCategory(undefined), 'other')
  assert.equal(normalizeCategory('寵物'), '寵物')
  assert.equal(normalizeCategory('food'), 'food')
})

test('categoryLabel：代碼與舊中文都顯示成目前語言，自訂分類原樣顯示', () => {
  assert.equal(categoryLabel('餐飲', tz), '餐飲')
  assert.equal(categoryLabel('food', tz), '餐飲')
  assert.equal(categoryLabel('餐飲', te), 'Food')
  assert.equal(categoryLabel('food', te), 'Food')
  assert.equal(categoryLabel('', te), 'Other')
  assert.equal(categoryLabel('寵物', te), '寵物')
})

test('categoryForWrite：WRITE_CODES 為 true 時寫代碼，自訂分類原樣', () => {
  assert.equal(WRITE_CODES, true)
  assert.equal(categoryForWrite('food'), 'food')
  assert.equal(categoryForWrite('refund'), 'refund')
  assert.equal(categoryForWrite('寵物'), '寵物')
})

test('付款方式：舊中文名稱轉代碼、顯示與寫入', () => {
  assert.equal(normalizePaymentMethod('街口支付'), 'jkopay')
  assert.equal(normalizePaymentMethod('現金'), 'cash')
  assert.equal(normalizePaymentMethod('銀行轉帳'), 'bank')
  assert.equal(normalizePaymentMethod('Richart'), 'richart')
  assert.equal(normalizePaymentMethod('其他'), 'other')
  assert.equal(normalizePaymentMethod('jkopay'), 'jkopay')
  assert.equal(paymentMethodLabel('街口支付', tz), '街口支付')
  assert.equal(paymentMethodLabel('jkopay', te), 'JKOPay')
  assert.equal(paymentMethodForWrite('jkopay'), 'jkopay')
  assert.equal(paymentMethodForWrite('cash'), 'cash')
})

test('activityForWrite：WRITE_CODES 為 true 時寫結構化資料', () => {
  assert.deepEqual(activityForWrite({ type: 'expense_added', title: 'X', name: '小明' }), { name: '小明', type: 'expense_added', title: 'X', toName: null })
  assert.deepEqual(activityForWrite({ type: 'settlement_added', name: null, toName: '小華' }), { name: null, type: 'settlement_added', title: null, toName: '小華' })
})

test('describeActivity：舊資料顯示原文，結構化資料依語言組句', () => {
  assert.equal(describeActivity({ text: '新增了「X」' }, te), '新增了「X」')
  assert.equal(describeActivity({}, tz), '')
  assert.equal(describeActivity({ type: 'expense_added', title: 'X' }, tz), '新增了「X」')
  assert.equal(describeActivity({ type: 'expense_added', title: 'X' }, te), 'Added "X"')
  assert.equal(describeActivity({ type: 'settlement_added', toName: null }, tz), '轉帳給 某人')
  assert.equal(describeActivity({ type: 'settlement_deleted' }, te), 'Deleted a transfer')
})

const LEGACY_SENTENCE = {
  expense_added: '新增了「X」', income_added: '新增了收入「X」', expense_updated: '修改了「X」', income_updated: '修改了收入「X」',
  expense_deleted: '刪除了「X」', income_deleted: '刪除了收入「X」', settlement_added: '轉帳給 小華', settlement_deleted: '刪除了一筆轉帳',
}

test('zh 顯示：結構化句子與舊句子逐字相同', () => {
  for (const type of ACTIVITY_TYPES) {
    assert.equal(describeActivity({ type, title: 'X', toName: '小華' }, tz), LEGACY_SENTENCE[type], type)
  }
})
