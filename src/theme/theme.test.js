import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMode, resolveTheme } from './theme.js'

test('normalizeMode 接受合法值', () => {
  assert.equal(normalizeMode('light'), 'light')
  assert.equal(normalizeMode('dark'), 'dark')
  assert.equal(normalizeMode('system'), 'system')
})

test('normalizeMode 非法值退回 system', () => {
  for (const v of [null, undefined, '', 'DARK', 'blue', 123]) assert.equal(normalizeMode(v), 'system', String(v))
})

test('resolveTheme 手動模式不受系統影響', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
})

test('resolveTheme system 跟隨系統', () => {
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
})
