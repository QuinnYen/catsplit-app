import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sumBySpendMethod, normalizeSpendType, spendMethodText, encodeSpend, decodeSpend } from './spendMethods.js'

const t = k => ({ 'spend.type.cash': '現金', 'spend.type.credit': '信用卡', 'spend.type.other': '其他' }[k] ?? k)

test('sumBySpendMethod：只按大類加總，備註不影響；缺值算現金；金額大到小', () => {
  const result = sumBySpendMethod([
    { amount: 100 },
    { amount: 50, paymentMethod: 'cash' },
    { amount: 400, paymentMethod: 'credit', paymentNote: '國泰 CUBE' },
    { amount: 250, paymentMethod: 'credit', paymentNote: '玉山 Pi' },
    { amount: 30, paymentMethod: 'mobile' },
  ])
  assert.deepEqual(result, [
    { name: 'credit', amount: 650 },
    { name: 'cash', amount: 150 },
    { name: 'mobile', amount: 30 },
  ])
})

test('sumBySpendMethod：沒有帳目回空；不認得的大類歸到其他', () => {
  assert.deepEqual(sumBySpendMethod([]), [])
  assert.deepEqual(sumBySpendMethod([{ amount: 80, paymentMethod: '國泰 CUBE' }]), [{ name: 'other', amount: 80 }])
})

test('normalizeSpendType：缺值當現金', () => {
  assert.equal(normalizeSpendType(undefined), 'cash')
  assert.equal(normalizeSpendType('credit'), 'credit')
})

test('spendMethodText：大類加備註，沒備註只有大類', () => {
  assert.equal(spendMethodText({ paymentMethod: 'credit', paymentNote: '國泰 CUBE' }, t), '信用卡・國泰 CUBE')
  assert.equal(spendMethodText({}, t), '現金')
})

test('encodeSpend / decodeSpend：來回一致，備註內含 | 也不會壞', () => {
  assert.equal(encodeSpend('credit', ''), 'credit')
  assert.deepEqual(decodeSpend('credit'), { type: 'credit', note: '' })
  assert.deepEqual(decodeSpend(encodeSpend('credit', 'A|B')), { type: 'credit', note: 'A|B' })
})
