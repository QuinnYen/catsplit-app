// Firestore 一個 batch 最多 500 個操作；大量寫入時切成小批（留餘裕給同批的餘額與帳戶更新）
export const BATCH_SIZE = 400

export const chunk = (items, size = BATCH_SIZE) => {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
