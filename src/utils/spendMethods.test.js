import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sumBySpendMethod, normalizeSpendType, spendMethodText } from './spendMethods.js'

const t = k => ({ 'spend.type.cash': '現金', 'spend.type.credit': '信用卡', 'spend.type.transit': '交通卡' }[k] ?? k)

test('sumBySpendMethod：只按大類加總，備註不影響；缺值算現金；金額大到小', () => {
  const result = sumBySpendMethod([
    { amount: 100 },
    { amount: 50, paymentMethod: 'cash' },
    { amount: 400, paymentMethod: 'credit', paymentNote: '國泰 CUBE' },
    { amount: 250, paymentMethod: 'credit', paymentNote: '玉山 Pi' },
    { amount: 30, paymentMethod: 'transit' },
  ])
  assert.deepEqual(result, [
    { name: 'credit', amount: 650 },
    { name: 'cash', amount: 150 },
    { name: 'transit', amount: 30 },
  ])
})

test('sumBySpendMethod：沒有帳目回空；不認得的大類歸到現金', () => {
  assert.deepEqual(sumBySpendMethod([]), [])
  assert.deepEqual(sumBySpendMethod([{ amount: 80, paymentMethod: '國泰 CUBE' }]), [{ name: 'cash', amount: 80 }])
})

test('normalizeSpendType：缺值當現金', () => {
  assert.equal(normalizeSpendType(undefined), 'cash')
  assert.equal(normalizeSpendType('credit'), 'credit')
})

test('spendMethodText：大類加備註，沒備註只有大類', () => {
  assert.equal(spendMethodText({ paymentMethod: 'credit', paymentNote: '國泰 CUBE' }, t), '信用卡・國泰 CUBE')
  assert.equal(spendMethodText({}, t), '現金')
})
