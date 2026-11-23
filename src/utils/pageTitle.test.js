import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageTitleKey } from './pageTitle.js'

test('pageTitleKey：各頁路徑對到頁面名稱 key', () => {
  assert.equal(pageTitleKey('/'), 'tab.home')
  assert.equal(pageTitleKey('/merge'), 'merge.title')
  assert.equal(pageTitleKey('/group/abc'), 'tab.group')
  assert.equal(pageTitleKey('/group/abc/'), 'tab.group')
  assert.equal(pageTitleKey('/group/abc/settle'), 'settle.title')
  assert.equal(pageTitleKey('/group/abc/expense/x1'), 'app.pageDetail')
  assert.equal(pageTitleKey('/group/abc/income/x1'), 'app.pageDetail')
  assert.equal(pageTitleKey('/group/abc/expense/x1/edit'), 'common.edit')
  assert.equal(pageTitleKey('/group/abc/income/x1/edit'), 'common.edit')
  assert.equal(pageTitleKey('/savings/new'), 'savings.form.newTitle')
  assert.equal(pageTitleKey('/savings/g1/edit'), 'savings.form.editTitle')
  assert.equal(pageTitleKey('/savings/g1'), 'savings.title')
})

test('pageTitleKey：不認得的路徑回 null', () => {
  assert.equal(pageTitleKey('/auth/callback'), null)
  assert.equal(pageTitleKey('/nope'), null)
})
