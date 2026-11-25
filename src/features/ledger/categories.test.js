import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultCategoryDocs, resolveCategories, categoryKeys, categoryName, planCategoryChange, categoryDocId, MAX_CATEGORIES } from './categories.js'

const t = (k) => ({ 'category.food': '餐飲', 'category.other': '其他', 'category.salary': '薪資' }[k] ?? k)
const nameOf = (resolved) => (kind, key) => categoryName(resolved, kind, key, t)
const plan = (stored, change) => planCategoryChange(stored, change, nameOf(resolveCategories(stored)))

test('沒有文件時用預設清單：支出含「其他」，收入與原本一致', () => {
  const r = resolveCategories([])
  assert.deepEqual(categoryKeys(r).expense, ['food', 'transport', 'lodging', 'shopping', 'entertainment', 'daily', 'medical', 'other'])
  assert.deepEqual(categoryKeys(r).income, ['salary', 'bonus', 'investment', 'refund', 'other'])
  assert.equal(resolveCategories(undefined).expense.length, 8)
})

test('依 order 排序、分種類；支出與收入的文件 id 不會撞', () => {
  const docs = [
    { id: 'e_b', kind: 'expense', key: 'b', order: 1 }, { id: 'e_a', kind: 'expense', key: 'a', order: 0, name: '甲' },
    { id: 'i_a', kind: 'income', key: 'a', order: 0 },
  ]
  assert.deepEqual(resolveCategories(docs), { expense: [{ key: 'a', name: '甲' }, { key: 'b' }], income: [{ key: 'a' }] })
  assert.notEqual(categoryDocId('expense', 'other'), categoryDocId('income', 'other'))
})

test('顯示名稱：自訂名稱優先、標準用翻譯、已刪除的自訂類別是「其他」、舊文字原樣', () => {
  const r = resolveCategories([{ id: 'e_food', kind: 'expense', key: 'food', name: '美食', order: 0 }, { id: 'e_c_x', kind: 'expense', key: 'c_x', name: '咖啡', order: 1 }])
  assert.equal(categoryName(r, 'expense', 'food', t), '美食')
  assert.equal(categoryName(r, 'expense', 'c_x', t), '咖啡')
  assert.equal(categoryName(r, 'expense', 'c_gone', t), '其他')
  assert.equal(categoryName(r, 'expense', 'other', t), '其他') // 標準代碼不在清單也用翻譯
  assert.equal(categoryName(r, 'income', 'salary', t), '薪資')
  assert.equal(categoryName(r, 'expense', '拿鐵', t), '拿鐵')
})

test('第一次編輯：把整份預設清單寫成文件，再套用修改', () => {
  const r = plan([], { type: 'add', kind: 'expense', name: '咖啡', key: 'c_k1' })
  assert.equal(r.sets.length, defaultCategoryDocs().length + 1)
  assert.deepEqual(r.deletes, [])
  const added = r.sets.find((s) => s.id === 'e_c_k1')
  assert.deepEqual(added.data, { kind: 'expense', key: 'c_k1', name: '咖啡', order: 8 })
})

test('已有文件時只寫有變的：改名只動那一份', () => {
  const stored = defaultCategoryDocs()
  const r = plan(stored, { type: 'rename', kind: 'expense', key: 'food', name: '美食' })
  assert.deepEqual(r, { sets: [{ id: 'e_food', data: { kind: 'expense', key: 'food', order: 0, name: '美食' } }], deletes: [] })
})

test('名稱驗證：空白、過長、同種類重名；收入與支出各自獨立', () => {
  const stored = defaultCategoryDocs()
  assert.equal(plan(stored, { type: 'add', kind: 'expense', name: '   ' }).error, 'name')
  assert.equal(plan(stored, { type: 'add', kind: 'expense', name: 'x'.repeat(21) }).error, 'name')
  assert.equal(plan(stored, { type: 'add', kind: 'expense', name: '餐飲' }).error, 'duplicate') // 標準類別的顯示名稱也算
  assert.equal(plan(stored, { type: 'add', kind: 'income', name: '餐飲' }).error, undefined)
  assert.equal(plan(stored, { type: 'rename', kind: 'expense', key: 'transport', name: '餐飲' }).error, 'duplicate')
  assert.equal(plan(stored, { type: 'rename', kind: 'expense', key: 'food', name: '餐飲' }).error, undefined) // 改成自己原本的名字沒關係
  assert.equal(plan(stored, { type: 'rename', kind: 'expense', key: 'nope', name: 'a' }).error, 'notFound')
})

test('數量上限', () => {
  const stored = Array.from({ length: MAX_CATEGORIES }, (_, i) => ({ id: `e_c_${i}`, kind: 'expense', key: `c_${i}`, name: `n${i}`, order: i }))
  assert.equal(plan(stored, { type: 'add', kind: 'expense', name: 'new' }).error, 'limit')
})

test('刪除：後面的順序補上，至少留一個，第一次編輯時不用刪文件', () => {
  const stored = defaultCategoryDocs()
  const r = plan(stored, { type: 'delete', kind: 'income', key: 'salary' })
  assert.deepEqual(r.deletes, ['i_salary'])
  assert.deepEqual(r.sets.map((s) => [s.id, s.data.order]), [['i_bonus', 0], ['i_investment', 1], ['i_refund', 2], ['i_other', 3]])
  const first = plan([], { type: 'delete', kind: 'income', key: 'salary' })
  assert.deepEqual(first.deletes, [])
  assert.ok(!first.sets.some((s) => s.id === 'i_salary'))
  assert.equal(first.sets.find((s) => s.id === 'i_bonus').data.order, 0)
  const one = [{ id: 'e_a', kind: 'expense', key: 'a', order: 0 }]
  assert.equal(plan(one, { type: 'delete', kind: 'expense', key: 'a' }).error, 'last')
})

test('上移與下移：與相鄰的對調，頭尾不動', () => {
  const stored = defaultCategoryDocs()
  const down = plan(stored, { type: 'move', kind: 'expense', key: 'food', dir: 1 })
  assert.deepEqual(down.sets.map((s) => [s.id, s.data.order]), [['e_food', 1], ['e_transport', 0]])
  assert.deepEqual(plan(stored, { type: 'move', kind: 'expense', key: 'food', dir: -1 }), { sets: [], deletes: [] })
  assert.deepEqual(plan(stored, { type: 'move', kind: 'expense', key: 'other', dir: 1 }), { sets: [], deletes: [] })
})

test('分類預算：設定與取消，只動那一份；無效金額被擋', () => {
  const stored = defaultCategoryDocs()
  const set = plan(stored, { type: 'budget', kind: 'expense', key: 'food', amount: 8000 })
  assert.deepEqual(set.sets, [{ id: 'e_food', data: { kind: 'expense', key: 'food', order: 0, budget: 8000 } }])
  const withBudget = [...stored.filter((d) => d.id !== 'e_food'), { ...stored.find((d) => d.id === 'e_food'), budget: 8000 }]
  assert.equal(resolveCategories(withBudget).expense[0].budget, 8000)
  const cleared = plan(withBudget, { type: 'budget', kind: 'expense', key: 'food', amount: null })
  assert.deepEqual(cleared.sets, [{ id: 'e_food', data: { kind: 'expense', key: 'food', order: 0 } }])
  assert.equal(plan(stored, { type: 'budget', kind: 'expense', key: 'food', amount: 0 }).error, 'budget')
  assert.equal(plan(stored, { type: 'budget', kind: 'expense', key: 'nope', amount: 5 }).error, 'notFound')
  // 第一次編輯：整份預設清單寫入
  assert.equal(plan([], { type: 'budget', kind: 'expense', key: 'food', amount: 100 }).sets.length, defaultCategoryDocs().length)
})
