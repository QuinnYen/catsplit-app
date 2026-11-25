import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunk } from './batch.js'

test('chunk：依大小切批，最後一批可以較小，空陣列回空', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(chunk([], 2), [])
  assert.equal(chunk(Array.from({ length: 801 }), 400).length, 3)
})
