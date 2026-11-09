import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sumBySpendMethod, normalizeSpendMethod, spendMethodLabel, isReservedSpendName } from './spendMethods.js'

test('sumBySpendMethod：缺值（舊資料）算現金，並依金額由大到小排序', () => {
  const result = sumBySpendMethod([
    { amount: 100 },
    { amount: 50, paymentMethod: 'cash' },
    { amount: 400, paymentMethod: '國泰 CUBE' },
    { amount: 250, paymentMethod: '國泰 CUBE' },
    { amount: 30, paymentMethod: 'credit' },
  ])
  assert.deepEqual(result, [
    { name: '國泰 CUBE', amount: 650 },
    { name: 'cash', amount: 150 },
    { name: 'credit', amount: 30 },
  ])
})

test('sumBySpendMethod：沒有任何帳目時仍列出現金與信用卡 0', () => {
  assert.deepEqual(sumBySpendMethod([]), [{ name: 'cash', amount: 0 }, { name: 'credit', amount: 0 }])
})

test('isReservedSpendName：擋掉內建代碼與顯示名稱', () => {
  const t = k => ({ 'payMethod.cash': '現金', 'spend.credit': '信用卡' }[k] ?? k)
  assert.equal(isReservedSpendName('信用卡', t), true)
  assert.equal(isReservedSpendName('Credit', t), true)
  assert.equal(isReservedSpendName('現金', t), true)
  assert.equal(isReservedSpendName('國泰 CUBE', t), false)
})

test('sumBySpendMethod：已刪除的卡只要名稱快照還在就照樣統計', () => {
  const result = sumBySpendMethod([{ amount: 80, paymentMethod: '已刪除的卡' }])
  assert.equal(result.find(r => r.name === '已刪除的卡').amount, 80)
})

test('normalizeSpendMethod / spendMethodLabel：缺值當現金，現金用翻譯、自訂名稱原樣顯示', () => {
  const t = k => ({ 'payMethod.cash': '現金', 'spend.credit': '信用卡' }[k] ?? k)
  assert.equal(normalizeSpendMethod(undefined), 'cash')
  assert.equal(spendMethodLabel(undefined, t), '現金')
  assert.equal(spendMethodLabel('credit', t), '信用卡')
  assert.equal(spendMethodLabel('玉山 Pi', t), '玉山 Pi')
})
