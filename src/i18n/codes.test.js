import { test } from 'node:test'
import assert from 'node:assert/strict'
import zhTW from './zh-TW.js'
import en from './en.js'
import { translate } from './core.js'
import {
  CATEGORY_CODES, PAYMENT_METHOD_CODES,
  normalizeCategory, categoryLabel, normalizePaymentMethod, paymentMethodLabel,
} from './codes.js'

const DICTS = { 'zh-TW': zhTW, en }
const tz = (key, params) => translate(DICTS, 'zh-TW', key, params)
const te = (key, params) => translate(DICTS, 'en', key, params)

test('代碼表：每個代碼在兩份字典都有對應的 key', () => {
  for (const code of CATEGORY_CODES) assert.ok(`category.${code}` in zhTW && `category.${code}` in en, code)
  for (const code of PAYMENT_METHOD_CODES) assert.ok(`payMethod.${code}` in zhTW && `payMethod.${code}` in en, code)
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
