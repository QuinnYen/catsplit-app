// 群組頁搜尋的篩選條件與比對（純函式，方便測試）。
// 比對對象是群組頁時間軸上的項目：{ ...文件, _type: 'expense' | 'income' | 'settlement' }
import { matchExpense } from './expenseHelpers.js'
import { normalizeCategory } from '../i18n/codes.js'

export const EMPTY_FILTERS = {
  range: 'all', // all | thisMonth | lastMonth | thisYear | lastYear | custom
  from: '', // custom 的起訖日（YYYY-MM-DD，可只填一邊）
  to: '',
  type: 'all', // all | expense | income | settlement
  category: null,
  currency: null,
  text: '',
  mine: false, // 只看和我有關的（我付款、我有分攤、我是轉帳的一方）
}

export const isFiltering = (f) =>
  f.range !== 'all' || f.type !== 'all' || !!f.category || !!f.currency || f.text.trim() !== '' || f.mine

const parseDay = (s) => {
  const [y, m, d] = String(s).split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}

// 回傳 { start, end }（start 含、end 不含，皆可為 null）；沒有日期條件時回傳 null
export const dateBounds = (f, now = new Date()) => {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (f.range) {
    case 'thisMonth': return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) }
    case 'lastMonth': return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) }
    case 'thisYear': return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) }
    case 'lastYear': return { start: new Date(y - 1, 0, 1), end: new Date(y, 0, 1) }
    case 'custom': {
      let start = parseDay(f.from)
      let end = parseDay(f.to)
      if (start && end && start > end) [start, end] = [end, start]
      if (end) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
      return start || end ? { start, end } : null
    }
    default: return null
  }
}

const isMine = (item, uid) => {
  if (item._type === 'settlement') return item.from === uid || item.to === uid
  const paid = item._type === 'income' ? item.received : item.payments
  return (paid?.[uid] ?? 0) > 0 || (item.splits?.[uid] ?? 0) > 0
}

const matchText = (item, text, memberProfiles, categoryLabelOf) => {
  if (item._type === 'settlement') {
    const names = [memberProfiles?.[item.from]?.name, memberProfiles?.[item.to]?.name].join(' ')
    return matchExpense({ title: names, note: item.note, payments: {}, amount: item.amount }, text, memberProfiles, '')
  }
  const doc = item._type === 'income' ? { ...item, payments: item.received } : item
  return matchExpense(doc, text, memberProfiles, categoryLabelOf(item.category))
}

/**
 * ctx：{ uid, memberProfiles, baseCurrency, categoryLabelOf(raw) → 顯示文字, now? }
 */
export const applyFilters = (items, f, ctx) => {
  if (!isFiltering(f)) return items
  const bounds = dateBounds(f, ctx.now)
  return items.filter(item => {
    if (f.type !== 'all' && item._type !== f.type) return false
    if (bounds) {
      const d = item.createdAt?.toDate?.()
      if (!d) return false
      if (bounds.start && d < bounds.start) return false
      if (bounds.end && d >= bounds.end) return false
    }
    // 轉帳沒有類別
    if (f.category && (item._type === 'settlement' || normalizeCategory(item.category) !== f.category)) return false
    if (f.currency && (item.currency || ctx.baseCurrency) !== f.currency) return false
    if (f.mine && !isMine(item, ctx.uid)) return false
    if (f.text.trim() && !matchText(item, f.text, ctx.memberProfiles, ctx.categoryLabelOf)) return false
    return true
  })
}
