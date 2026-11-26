// 幣別頁拖動排序的純函式。

// 把 list 的第 from 個搬到第 to 個（超出範圍時夾在頭尾），回傳新陣列，不改動原本的
export const moveItem = (list, from, to) => {
  if (from < 0 || from >= list.length) return list
  const target = Math.max(0, Math.min(list.length - 1, to))
  if (target === from) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

// 拖動中的項目從 startIndex 往下拖了 dy 像素（每一項高度 itemHeight）後，應該落在第幾個位置
export const dragTargetIndex = (startIndex, dy, itemHeight, count) => {
  if (!(itemHeight > 0)) return startIndex
  return Math.max(0, Math.min(count - 1, startIndex + Math.round(dy / itemHeight)))
}
