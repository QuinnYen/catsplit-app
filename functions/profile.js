// users/{uid} 的名稱、頭像、登入方式規則（純函式，無 import）。
// 每個登入方式各存一份（names / avatars 的 line、google），顯示用的欄位由規則決定：LINE 優先，沒有才用 Google。
// 不能讓「最後登入的方式」決定：同一個人在不同裝置用不同方式登入，名稱與頭像會一直跳，群組裡其他成員也會看到。
// provider 只在「這個帳號沒有 LINE 名字可退回」時才是 'google'（用來要求首次設定暱稱），有 LINE 名字就是 null。

const AVATAR_MAX = 500

// 只收 https 網址且不要太長；其他一律當作沒有
export const cleanAvatarUrl = (value) =>
  (typeof value === 'string' && value.startsWith('https://') && value.length <= AVATAR_MAX ? value : null)

// 名稱：只收非空字串
export const cleanName = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null)

// 顯示用的頭像、名稱：LINE 優先，其次 Google，都沒有是 null
export const pickAvatar = ({ line, google } = {}) => cleanAvatarUrl(line) ?? cleanAvatarUrl(google) ?? null
export const pickName = ({ line, google } = {}) => cleanName(line) ?? cleanName(google) ?? null

/**
 * 目前每個登入方式各自的名稱與頭像 { names, avatars }。
 * 舊資料沒有 names / avatars 欄位：當時 LINE 登入存 LINE 的名稱與頭像，Google 登入存 Google 的名稱、頭像一律 null 並標 provider 'google'，
 * 所以 provider 不是 'google' 的既有 name、avatar 視為 LINE 的，否則 Google 登入第一次就會把它們蓋掉。
 */
export const currentProfiles = (doc) => {
  const legacyIsLine = !!doc && doc.provider !== 'google'
  const names = doc?.names && typeof doc.names === 'object' ? doc.names : { line: legacyIsLine ? doc?.name : null, google: null }
  const avatars = doc?.avatars && typeof doc.avatars === 'object' ? doc.avatars : { line: legacyIsLine ? doc?.avatar : null, google: null }
  return {
    names: { line: cleanName(names.line), google: cleanName(names.google) },
    avatars: { line: cleanAvatarUrl(avatars.line), google: cleanAvatarUrl(avatars.google) },
  }
}

// 由各登入方式的名稱與頭像算出要寫進 users/{uid} 的欄位
const resolveProfile = ({ names, avatars }) => ({
  names,
  avatars,
  name: pickName(names),
  avatar: pickAvatar(avatars),
  provider: names.line ? null : (names.google ? 'google' : null),
})

/** 登入時更新這個登入方式（'line' | 'google'）的名稱與頭像，其他登入方式的不動。doc 是目前的 users/{uid}（沒有就 null） */
export const nextProfile = (doc, provider, { name, picture } = {}) => {
  const cur = currentProfiles(doc)
  return resolveProfile({
    names: { ...cur.names, [provider]: cleanName(name) },
    avatars: { ...cur.avatars, [provider]: cleanAvatarUrl(picture) },
  })
}

/** 合併兩個帳號的 users 文件：兩邊各登入方式的名稱與頭像取聯集，同一種兩邊都有時以保留帳號的為準 */
export const mergeProfiles = (keepDoc, dropDoc) => {
  const keep = currentProfiles(keepDoc)
  const drop = currentProfiles(dropDoc)
  const pick = (k, d) => k ?? d
  return resolveProfile({
    names: { line: pick(keep.names.line, drop.names.line), google: pick(keep.names.google, drop.names.google) },
    avatars: { line: pick(keep.avatars.line, drop.avatars.line), google: pick(keep.avatars.google, drop.avatars.google) },
  })
}
