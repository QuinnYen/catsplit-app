import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolutionFromChoice, choiceFromResolution, initialChoices, buildResolutionsPayload, conflictLabelKey, conflictValues,
  isPreviewExpired, summarizePreview, mergeErrorKey, savePreview, loadPreview, clearPreview, PREVIEW_STORAGE_KEY,
} from './mergeUi.js'

const makePreview = (over = {}) => ({
  mergeId: 'a.b',
  initiatorIsDropped: true,
  groups: { bothIn: [{ id: 'g1', name: 'A' }], dropOnly: [{ id: 'g2', name: 'B' }, { id: 'g3', name: 'C' }] },
  impact: { expenses: 3, settlements: 2, incomes: 1, selfTransfers: 1 },
  personal: {
    docCount: 4,
    auto: [{ path: 'settings/oaPrompt', suggested: 'keep' }],
    needsChoice: [
      { path: 'settings/profile', suggested: 'drop', keepNickname: 'LNick', dropNickname: 'GNick' },
      { path: 'transactions/group_g1', suggested: 'keep' },
    ],
  },
  expiresAtMs: 1000,
  ...over,
})

test('resolutionFromChoice：發起人被併入時，發起人的版本是 drop；否則是 keep', () => {
  assert.equal(resolutionFromChoice('initiator', true), 'drop')
  assert.equal(resolutionFromChoice('other', true), 'keep')
  assert.equal(resolutionFromChoice('initiator', false), 'keep')
  assert.equal(resolutionFromChoice('other', false), 'drop')
})

test('choiceFromResolution 與 resolutionFromChoice 互為反函式', () => {
  for (const dropped of [true, false]) {
    for (const choice of ['initiator', 'other']) {
      assert.equal(choiceFromResolution(resolutionFromChoice(choice, dropped), dropped), choice)
    }
    for (const res of ['keep', 'drop']) {
      assert.equal(resolutionFromChoice(choiceFromResolution(res, dropped), dropped), res)
    }
  }
})

test('initialChoices：只含需要決定的衝突，預設是雲端函式建議的那份', () => {
  // 發起人被併入：建議 drop（發起人的）→ initiator；建議 keep（對方的）→ other
  assert.deepEqual(initialChoices(makePreview()), { 'settings/profile': 'initiator', 'transactions/group_g1': 'other' })
  assert.deepEqual(initialChoices(makePreview({ initiatorIsDropped: false })), { 'settings/profile': 'other', 'transactions/group_g1': 'initiator' })
  assert.deepEqual(initialChoices({}), {})
})

test('buildResolutionsPayload：把使用者的選擇換回 keep / drop，沒選的用建議值，不含自動處理的', () => {
  const p = makePreview()
  assert.deepEqual(buildResolutionsPayload(p, {}), { 'settings/profile': 'drop', 'transactions/group_g1': 'keep' })
  assert.deepEqual(
    buildResolutionsPayload(p, { 'settings/profile': 'other', 'transactions/group_g1': 'initiator' }),
    { 'settings/profile': 'keep', 'transactions/group_g1': 'drop' },
  )
  // 預設選項送出去就是雲端函式的建議
  assert.deepEqual(buildResolutionsPayload(p, initialChoices(p)), { 'settings/profile': 'drop', 'transactions/group_g1': 'keep' })
})

test('conflictLabelKey 與 conflictValues', () => {
  assert.equal(conflictLabelKey('settings/profile'), 'merge.conflict.nickname')
  assert.equal(conflictLabelKey('transactions/group_g1'), null)
  const c = makePreview().personal.needsChoice[0]
  assert.deepEqual(conflictValues(c, true), { initiator: 'GNick', other: 'LNick' })
  assert.deepEqual(conflictValues(c, false), { initiator: 'LNick', other: 'GNick' })
  assert.equal(conflictValues({ path: 'transactions/group_g1' }, true), null)
  assert.deepEqual(conflictValues({ path: 'settings/profile', keepNickname: null, dropNickname: 'X' }, false), { initiator: null, other: 'X' })
})

test('isPreviewExpired：逾時、沒有預覽、沒有到期時間都算過期', () => {
  assert.equal(isPreviewExpired(makePreview(), 999), false)
  assert.equal(isPreviewExpired(makePreview(), 1000), true)
  assert.equal(isPreviewExpired(null, 0), true)
  assert.equal(isPreviewExpired({ mergeId: 'x' }, 0), true)
})

test('summarizePreview：摘要數字，缺欄位當 0', () => {
  assert.deepEqual(summarizePreview(makePreview()), { bothIn: 1, dropOnly: 2, records: 6, selfTransfers: 1, personalDocs: 4 })
  assert.deepEqual(summarizePreview({}), { bothIn: 0, dropOnly: 0, records: 0, selfTransfers: 0, personalDocs: 0 })
})

test('mergeErrorKey：已知錯誤碼對到訊息，其他一律是通用訊息', () => {
  assert.equal(mergeErrorKey('preview_expired'), 'merge.err.expired')
  assert.equal(mergeErrorKey('proof_invalid'), 'merge.err.proof')
  assert.equal(mergeErrorKey('proof_expired'), 'merge.err.proof')
  assert.equal(mergeErrorKey('merge_running'), 'merge.err.running')
  assert.equal(mergeErrorKey('groups_failed'), 'merge.err.partial')
  assert.equal(mergeErrorKey('other_merge_in_progress'), 'merge.err.inProgress')
  assert.equal(mergeErrorKey('last_identity'), 'merge.err.lastIdentity')
  assert.equal(mergeErrorKey('network'), 'merge.err.network')
  assert.equal(mergeErrorKey('something_new'), 'merge.err.generic')
  assert.equal(mergeErrorKey(undefined), 'merge.err.generic')
})

const memoryStorage = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }
}

test('savePreview 與 loadPreview：存取、帶上 provider、逾時就當沒有', () => {
  const s = memoryStorage()
  savePreview(s, makePreview(), 'line')
  assert.equal(loadPreview(s, 500).provider, 'line')
  assert.equal(loadPreview(s, 500).mergeId, 'a.b')
  assert.equal(loadPreview(s, 1000), null)
  clearPreview(s)
  assert.equal(loadPreview(s, 0), null)
})

test('loadPreview：壞掉的內容或存取失敗都當沒有，不會丟錯', () => {
  const s = memoryStorage()
  s.setItem(PREVIEW_STORAGE_KEY, '{not json')
  assert.equal(loadPreview(s, 0), null)
  s.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ nope: 1 }))
  assert.equal(loadPreview(s, 0), null)
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
  assert.equal(loadPreview(broken, 0), null)
  assert.doesNotThrow(() => savePreview(broken, makePreview(), 'line'))
  assert.doesNotThrow(() => clearPreview(broken))
})
