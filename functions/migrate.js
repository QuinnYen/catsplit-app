// migrateMember 用到的純函式（沒有任何 import，方便用 node:test 直接測）

export const round2 = (n) => Math.round(n * 100) / 100

// 把 map 的 from 鍵併入 to 鍵（金額相加）；沒有 from 時原樣回傳 null 表示不用改
export const moveKey = (map, from, to) => {
  if (!map || !(from in map)) return null
  const next = { ...map }
  next[to] = round2((next[to] || 0) + next[from])
  delete next[from]
  return next
}

export const swapId = (value, from, to) => (value === from ? to : value)

// 各子集合裡要轉移成員的欄位：maps 是 { uid: 金額 } 的 map，ids 是存單一 uid 的欄位
export const MIGRATION_FIELDS = {
  expenses: { maps: ['payments', 'splits', 'shares'], ids: ['createdBy'] },
  settlements: { maps: [], ids: ['from', 'to', 'settledBy'] },
  incomes: { maps: ['received', 'splits', 'shares'], ids: ['createdBy'] },
}

// 回傳把 fromId 轉成 toUid 的更新內容；沒有需要改的欄位時回傳 null
export const migrationPatch = (data, fields, fromId, toUid) => {
  const patch = {}
  for (const field of fields.maps) {
    const moved = moveKey(data[field], fromId, toUid)
    if (moved) patch[field] = moved
  }
  for (const field of fields.ids) {
    if (data[field] === fromId) patch[field] = toUid
  }
  return Object.keys(patch).length ? patch : null
}
