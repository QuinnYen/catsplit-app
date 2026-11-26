import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveItem, dragTargetIndex } from './reorder.js'

test('moveItem：往後、往前搬，不改動原陣列', () => {
  const list = ['A', 'B', 'C', 'D']
  assert.deepEqual(moveItem(list, 0, 2), ['B', 'C', 'A', 'D'])
  assert.deepEqual(moveItem(list, 3, 1), ['A', 'D', 'B', 'C'])
  assert.deepEqual(moveItem(list, 1, 2), ['A', 'C', 'B', 'D'])
  assert.deepEqual(list, ['A', 'B', 'C', 'D'])
})

test('moveItem：沒變動、超出範圍', () => {
  const list = ['A', 'B', 'C']
  assert.equal(moveItem(list, 1, 1), list)
  assert.deepEqual(moveItem(list, 0, 99), ['B', 'C', 'A']) // 夾在最後
  assert.deepEqual(moveItem(list, 2, -5), ['C', 'A', 'B']) // 夾在最前
  assert.equal(moveItem(list, 5, 0), list) // 來源不存在
  assert.equal(moveItem(list, -1, 0), list)
  assert.deepEqual(moveItem([], 0, 1), [])
})

test('dragTargetIndex：依拖動距離四捨五入到最近的位置，夾在範圍內', () => {
  assert.equal(dragTargetIndex(1, 0, 60, 4), 1)
  assert.equal(dragTargetIndex(1, 29, 60, 4), 1) // 不到半格
  assert.equal(dragTargetIndex(1, 31, 60, 4), 2) // 過半格
  assert.equal(dragTargetIndex(1, 130, 60, 4), 3)
  assert.equal(dragTargetIndex(1, -70, 60, 4), 0)
  assert.equal(dragTargetIndex(1, 9999, 60, 4), 3) // 夾在最後
  assert.equal(dragTargetIndex(1, -9999, 60, 4), 0) // 夾在最前
  assert.equal(dragTargetIndex(2, 50, 0, 4), 2) // 高度未知時不動
})
