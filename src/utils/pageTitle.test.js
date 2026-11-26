import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageTitleKey } from './pageTitle.js'

test('pageTitleKey：各頁路徑對到頁面名稱 key', () => {
  assert.equal(pageTitleKey('/'), 'tab.split')
  assert.equal(pageTitleKey('/home'), 'tab.home')
  assert.equal(pageTitleKey('/ledger'), 'tab.ledger')
  assert.equal(pageTitleKey('/ledger/accounts'), 'ledger.tab.accounts')
  assert.equal(pageTitleKey('/ledger/stats'), 'ledger.chart')
  assert.equal(pageTitleKey('/ledger/settings'), 'ledger.tab.settings')
  assert.equal(pageTitleKey('/ledger/settings/recurring'), 'ledger.set.recurring')
  assert.equal(pageTitleKey('/ledger/settings/budget'), 'ledger.set.budget')
  assert.equal(pageTitleKey('/ledger/settings/categories'), 'ledger.set.categories')
  assert.equal(pageTitleKey('/fx'), 'tab.fx')
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
