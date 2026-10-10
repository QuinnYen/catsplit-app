import { test } from 'node:test'
import assert from 'node:assert/strict'
import zhTW from './zh-TW.js'
import en from './en.js'
import { translate } from './core.js'
import {
  CATEGORY_CODES, PAYMENT_METHOD_CODES, ACTIVITY_TYPES,
  normalizeCategory, categoryLabel, normalizePaymentMethod, paymentMethodLabel,
  activityForWrite, describeActivity,
} from './codes.js'

const DICTS = { 'zh-TW': zhTW, en }
const tz = (key, params) => translate(DICTS, 'zh-TW', key, params)
const te = (key, params) => translate(DICTS, 'en', key, params)

test('代碼表：每個代碼在兩份字典都有對應的 key', () => {
  for (const code of CATEGORY_CODES) assert.ok(`category.${code}` in zhTW && `category.${code}` in en, code)
  for (const code of PAYMENT_METHOD_CODES) assert.ok(`payMethod.${code}` in zhTW && `payMethod.${code}` in en, code)
  for (const type of ACTIVITY_TYPES) assert.ok(`activity.${type}` in zhTW && `activity.${type}` in en, type)
})

test('normalizeCategory：空值為 other，自訂分類與代碼原樣保留', () => {
  assert.equal(normalizeCategory(''), 'other')
  assert.equal(normalizeCategory(undefined), 'other')
  assert.equal(normalizeCategory('寵物'), '寵物')
  assert.equal(normalizeCategory('food'), 'food')
})

test('categoryLabel：代碼顯示成目前語言，自訂分類原樣顯示', () => {
  assert.equal(categoryLabel('food', tz), '餐飲')
  assert.equal(categoryLabel('food', te), 'Food')
  assert.equal(categoryLabel('', te), 'Other')
  assert.equal(categoryLabel('寵物', te), '寵物')
})

test('付款方式：空值為現金，代碼顯示成目前語言，其他原樣', () => {
  assert.equal(normalizePaymentMethod(undefined), 'cash')
  assert.equal(paymentMethodLabel('jkopay', tz), '街口支付')
  assert.equal(paymentMethodLabel('jkopay', te), 'JKOPay')
  assert.equal(paymentMethodLabel('cash', te), 'Cash')
  assert.equal(paymentMethodLabel('其他來源', te), '其他來源')
})

test('activityForWrite：寫結構化資料，缺少的名字存 null', () => {
  assert.deepEqual(activityForWrite({ type: 'expense_added', title: 'X', name: '小明' }), { name: '小明', type: 'expense_added', title: 'X', toName: null })
  assert.deepEqual(activityForWrite({ type: 'settlement_added', name: null, toName: '小華' }), { name: null, type: 'settlement_added', title: null, toName: '小華' })
})

test('describeActivity：依語言組句，沒有動態時為空字串', () => {
  assert.equal(describeActivity({}, tz), '')
  assert.equal(describeActivity(undefined, tz), '')
  assert.equal(describeActivity({ type: 'expense_added', title: 'X' }, tz), '新增了「X」')
  assert.equal(describeActivity({ type: 'expense_added', title: 'X' }, te), 'Added "X"')
  assert.equal(describeActivity({ type: 'settlement_added', toName: null }, tz), '轉帳給 某人')
  assert.equal(describeActivity({ type: 'settlement_deleted' }, te), 'Deleted a transfer')
})

test('每種動態在中文都有句子', () => {
  const sentence = {
    expense_added: '新增了「X」', income_added: '新增了收入「X」', expense_updated: '修改了「X」', income_updated: '修改了收入「X」',
    expense_deleted: '刪除了「X」', income_deleted: '刪除了收入「X」', settlement_added: '轉帳給 小華', settlement_deleted: '刪除了一筆轉帳',
  }
  for (const type of ACTIVITY_TYPES) assert.equal(describeActivity({ type, title: 'X', toName: '小華' }, tz), sentence[type], type)
})
