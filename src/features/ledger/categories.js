// 帳本的類別（每個帳本各一份）。純函式：預設清單、整理成顯示用清單、名稱顯示、增刪改與排序的寫入計畫。
// 存成 ledgers/{id}/categories/{文件id} 的子集合（rules 無法逐項驗證陣列，所以一個類別一份文件）：
//   kind 'expense' | 'income'、key（帳目 category 欄位存的值）、name（選填，標準類別沒有名稱就用翻譯）、order（整數）
// 文件 id = 'e_' 或 'i_' 加 key（支出與收入都有 'other'，id 不能撞）。自訂類別的 key 是 'c_' 加亂數。
// 沒有任何類別文件的帳本直接用預設清單；第一次編輯時才把預設清單一次寫成文件。
import { DEFAULT_CATEGORIES } from '../../config/expenseForm.js'
import { categoryLabel } from '../../i18n/codes.js'

export const CATEGORY_NAME_MAX = 20
export const MAX_CATEGORIES = 30 // 每種，前端限制
export const CUSTOM_PREFIX = 'c_'

export const DEFAULT_EXPENSE_KEYS = [...DEFAULT_CATEGORIES, 'other']
export const DEFAULT_INCOME_KEYS = ['salary', 'bonus', 'investment', 'refund', 'other']

export const categoryDocId = (kind, key) => `${kind === 'income' ? 'i' : 'e'}_${key}`

export const defaultCategoryDocs = () => [
  ...DEFAULT_EXPENSE_KEYS.map((key, order) => ({ id: categoryDocId('expense', key), kind: 'expense', key, order })),
  ...DEFAULT_INCOME_KEYS.map((key, order) => ({ id: categoryDocId('income', key), kind: 'income', key, order })),
]

const byOrder = (a, b) => (a.order - b.order) || (a.key < b.key ? -1 : 1)

// 整理成 { expense: [{ key, name? }], income: [...] }，依 order；沒有任何文件時用預設清單
export const resolveCategories = (docs) => {
  const source = docs && docs.length > 0 ? docs : defaultCategoryDocs()
  const pick = (kind) => source.filter((d) => d.kind === kind).sort(byOrder).map(({ key, name }) => ({ key, ...(name && { name }) }))
  return { expense: pick('expense'), income: pick('income') }
}

export const categoryKeys = (resolved) => ({ expense: resolved.expense.map((c) => c.key), income: resolved.income.map((c) => c.key) })

/**
 * 類別顯示名稱。kind 是 'expense' 或 'income'（帳目的 type）。
 * 清單裡有自訂名稱用它；標準類別沒有名稱用翻譯；自訂類別已被刪除（c_ 開頭但清單找不到）顯示「其他」；
 * 其他（舊的自由文字）原樣顯示。
 */
export const categoryName = (resolved, kind, key, t) => {
  const found = resolved[kind === 'income' ? 'income' : 'expense'].find((c) => c.key === key)
  if (found?.name) return found.name
  if (!found && typeof key === 'string' && key.startsWith(CUSTOM_PREFIX)) return t('category.other')
  return categoryLabel(key, t)
}

const newKey = () => `${CUSTOM_PREFIX}${Math.random().toString(36).slice(2, 10)}`

/**
 * 增刪改與排序要寫入什麼。stored：目前的類別文件（可能是空，代表還在用預設清單）；
 * nameOf(kind, key)：顯示名稱（用來擋同種類重名）。change：
 *   { type: 'add', kind, name } | { type: 'rename', kind, key, name } | { type: 'delete', kind, key } | { type: 'move', kind, key, dir: -1 | 1 }
 * 回傳 { sets: [{ id, data }], deletes: [id] } 或 { error }（'name'：空白或超長、'duplicate'、'limit'、'last'、'notFound'）。
 * stored 是空的時候，sets 會包含整份預設清單（第一次編輯才寫入）。
 */
export const planCategoryChange = (stored, change, nameOf) => {
  const materialize = !stored || stored.length === 0
  const docs = (materialize ? defaultCategoryDocs() : stored.map((d) => ({ ...d }))).map((d) => ({ ...d }))
  const baseline = new Map(docs.map((d) => [d.id, JSON.stringify(d)]))
  const ofKind = (kind) => docs.filter((d) => d.kind === kind).sort(byOrder)
  // docs 已是修改後的樣子：沒有文件時整份預設寫入，否則只寫有變的；刪除的文件 id 在 deleteIds
  const finish = (deleteIds = []) => ({
    sets: docs.filter((d) => materialize || baseline.get(d.id) !== JSON.stringify(d)).map(({ id, ...data }) => ({ id, data })),
    deletes: materialize ? [] : deleteIds,
  })

  const { kind } = change
  const list = ofKind(kind)

  if (change.type === 'add' || change.type === 'rename') {
    const name = String(change.name ?? '').trim()
    if (!name || name.length > CATEGORY_NAME_MAX) return { error: 'name' }
    const clash = list.some((d) => (change.type === 'rename' ? d.key !== change.key : true) && nameOf(kind, d.key) === name)
    if (clash) return { error: 'duplicate' }
    if (change.type === 'add') {
      if (list.length >= MAX_CATEGORIES) return { error: 'limit' }
      const key = change.key ?? newKey()
      docs.push({ id: categoryDocId(kind, key), kind, key, name, order: (list.at(-1)?.order ?? -1) + 1 })
      return finish()
    }
    const target = docs.find((d) => d.id === categoryDocId(kind, change.key))
    if (!target) return { error: 'notFound' }
    target.name = name
    return finish()
  }

  const target = list.find((d) => d.key === change.key)
  if (!target) return { error: 'notFound' }

  if (change.type === 'delete') {
    if (list.length <= 1) return { error: 'last' }
    const remaining = list.filter((d) => d !== target)
    remaining.forEach((d, i) => { d.order = i })
    docs.splice(docs.findIndex((d) => d.id === target.id), 1)
    return finish([target.id])
  }

  if (change.type === 'move') {
    const i = list.indexOf(target)
    const j = i + change.dir
    if (j < 0 || j >= list.length) return { sets: [], deletes: [] }
    ;[list[i], list[j]] = [list[j], list[i]]
    list.forEach((d, n) => { d.order = n })
    return finish()
  }
  return { error: 'notFound' }
}
