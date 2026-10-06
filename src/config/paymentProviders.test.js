import test from 'node:test'
import assert from 'node:assert/strict'
import { getProvider, normalizeValue, validatePayment, getBankName, searchBanks, describeMethod, methodName } from './paymentProviders.js'

const jko = getProvider('jkopay')
const richart = getProvider('richart')
const bank = getProvider('bank')

test('街口：接受帳號或整條收款連結', () => {
  assert.equal(normalizeValue(jko, '123456789'), '123456789')
  assert.equal(normalizeValue(jko, 'https://service.jkopay.com/r/transfer?j=Transfer:123456789'), '123456789')
  assert.equal(normalizeValue(jko, 'abc'), '')
  assert.equal(jko.openUrl('123456789'), 'https://service.jkopay.com/r/transfer?j=Transfer:123456789')
})

test('Richart：從連結取出 token，也接受單獨 token', () => {
  const token = '0123456789ABCDEF0123456789ABCDEF'
  assert.equal(normalizeValue(richart, `https://richart.tw/TSDIB_RichartWeb/RC04/RC040300?token=${token}`), token)
  assert.equal(normalizeValue(richart, token), token)
  const message = `台新銀行(812)帳號是12345678901234或是點擊連結開啟Richart APP可以直接帶入我的帳號唷  https://richart.tw/TSDIB_RichartWeb/RC04/RC040300?token=${token}`
  assert.equal(normalizeValue(richart, message), token)
  assert.equal(normalizeValue(richart, 'https://example.com'), '')
  assert.equal(richart.openUrl(token), `https://richart.tw/TSDIB_RichartWeb/RC04/RC040300?token=${token}`)
})

test('銀行：代碼 3 碼、帳號 6～16 碼數字，空白與連字號會被移除', () => {
  const value = normalizeValue(bank, '1234-5678 901234')
  assert.equal(value, '12345678901234')
  assert.equal(validatePayment(bank, { value, bankCode: '812' }), '')
  assert.notEqual(validatePayment(bank, { value, bankCode: '81' }), '')
  assert.notEqual(validatePayment(bank, { value, bankCode: '999' }), '')
  assert.notEqual(validatePayment(bank, { value: '123', bankCode: '812' }), '')
})

test('銀行代碼表：查名稱、依代碼或關鍵字搜尋、顯示文字帶銀行名稱', () => {
  assert.equal(getBankName('812'), '台新國際商業銀行')
  assert.equal(getBankName('xyz'), undefined)
  assert.ok(searchBanks('812').some(b => b.code === '812'))
  assert.ok(searchBanks('台新').some(b => b.code === '812'))
  assert.deepEqual(searchBanks(' '), [])
  assert.equal(describeMethod({ providerId: 'bank', bankCode: '812', value: '12345678901234' }), '台新國際商業銀行 (812) 12345678901234')
})

test('自行輸入：名稱與收款資訊都必填，顯示用使用者填的名稱', () => {
  const custom = getProvider('custom')
  assert.equal(validatePayment(custom, { value: 'abc', customName: '全支付' }), '')
  assert.notEqual(validatePayment(custom, { value: 'abc', customName: '' }), '')
  assert.notEqual(validatePayment(custom, { value: '', customName: '全支付' }), '')
  assert.equal(methodName({ providerId: 'custom', customName: '全支付' }), '全支付')
  assert.equal(describeMethod({ providerId: 'custom', value: 'abc123' }), 'abc123')
})
