// 分享連結預覽（og: 標籤）的文字。語言由網址的 ?hl= 決定，只認 'en'，其他值一律是繁體中文；
// 不使用 ?lang=，避免與 App 內手動選擇語言的參數混在一起。
export const normalizeHl = (value) => (value === 'en' ? 'en' : 'zh-TW')

const TEXT = {
  'zh-TW': { site: '貓咪分帳 CatSplit', description: '分帳群組・點開進入記帳', title: (name) => `${name}｜貓咪分帳 CatSplit` },
  en: { site: 'CatSplit', description: 'Expense group · Tap to open and start recording', title: (name) => `${name} | CatSplit` },
}

export const previewText = (groupName, hlParam) => {
  const text = TEXT[normalizeHl(hlParam)]
  return { site: text.site, description: text.description, title: groupName ? text.title(groupName) : text.site }
}
