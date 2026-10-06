import test from 'node:test'
import assert from 'node:assert/strict'
import { getProvider, normalizeValue, validatePayment } from './paymentProviders.js'

const jko = getProvider('jkopay')
const richart = getProvider('richart')
const bank = getProvider('bank')

test('街口：接受帳號或整條收款連結', () => {
  assert.equal(normalizeValue(jko, '900587854'), '900587854')
  assert.equal(normalizeValue(jko, 'https://service.jkopay.com/r/transfer?j=Transfer:900587854'), '900587854')
  assert.equal(normalizeValue(jko, 'abc'), '')
  assert.equal(jko.openUrl('900587854'), 'https://service.jkopay.com/r/transfer?j=Transfer:900587854')
})

test('Richart：從連結取出 token，也接受單獨 token', () => {
  const token = '8E0D4F892E7AA1B7DF6CB7D650657316'
  assert.equal(normalizeValue(richart, `https://richart.tw/TSDIB_RichartWeb/RC04/RC040300?token=${token}`), token)
  assert.equal(normalizeValue(richart, token), token)
  assert.equal(normalizeValue(richart, 'https://example.com'), '')
  assert.equal(richart.openUrl(token), `https://richart.tw/TSDIB_RichartWeb/RC04/RC040300?token=${token}`)
})

test('銀行：代碼 3 碼、帳號 6～16 碼數字，空白與連字號會被移除', () => {
  const value = normalizeValue(bank, '2888-1015 810144')
  assert.equal(value, '28881015810144')
  assert.equal(validatePayment(bank, { value, bankCode: '812' }), '')
  assert.notEqual(validatePayment(bank, { value, bankCode: '81' }), '')
  assert.notEqual(validatePayment(bank, { value: '123', bankCode: '812' }), '')
})
