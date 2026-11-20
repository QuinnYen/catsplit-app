import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getBalanceStatus, isBalanceSettled } from './balanceStatus.js'

test('日圓：小於 0.5 的尾差視為已結清', () => {
  assert.equal(getBalanceStatus(0.4, 'JPY'), 'settled')
  assert.equal(getBalanceStatus(-0.33, 'JPY'), 'settled')
  assert.equal(getBalanceStatus(0, 'JPY'), 'settled')
})

test('日圓：達一圓以上仍是待收款／待付款', () => {
  assert.equal(getBalanceStatus(1, 'JPY'), 'receive')
  assert.equal(getBalanceStatus(-1, 'JPY'), 'pay')
})

test('美元：0.01 剛好是邊界，不會誤判成待付款', () => {
  assert.equal(getBalanceStatus(0.01, 'USD'), 'receive')
  assert.equal(getBalanceStatus(-0.01, 'USD'), 'pay')
  assert.equal(getBalanceStatus(0.004, 'USD'), 'settled')
  assert.equal(getBalanceStatus(1e-13, 'USD'), 'settled')
})

test('沒有餘額資料或沒有幣別時有預設值', () => {
  assert.equal(getBalanceStatus(null, 'JPY'), 'settled')
  assert.equal(getBalanceStatus(0.4, undefined), 'settled')
})

test('isBalanceSettled', () => {
  assert.equal(isBalanceSettled(0.4, 'JPY'), true)
  assert.equal(isBalanceSettled(5, 'JPY'), false)
})
