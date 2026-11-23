// 頭像規則（純函式，無 import）：每個登入方式各存一份頭像，顯示用的優先用 LINE，沒有才用 Google，都沒有就是 null（畫面顯示名字首字）。
// 不能讓「最後登入的方式」決定：同一個人在不同裝置用不同方式登入，頭像會一直跳，群組裡其他成員也會看到。

const AVATAR_MAX = 500

// 只收 https 網址且不要太長；其他一律當作沒有
export const cleanAvatarUrl = (value) =>
  (typeof value === 'string' && value.startsWith('https://') && value.length <= AVATAR_MAX ? value : null)

// 顯示用的頭像：LINE 優先，其次 Google
export const pickAvatar = ({ line, google } = {}) => cleanAvatarUrl(line) ?? cleanAvatarUrl(google) ?? null

/**
 * 登入時更新這個登入方式的頭像，回傳要寫進 users/{uid} 的 { avatars, avatar }。
 * doc 是目前的 users/{uid}（沒有就 null）；provider 是這次登入的方式（'line' | 'google'）。
 * 舊資料沒有 avatars 欄位：當時只有 LINE 會存頭像（Google 一律存 null），所以既有的 avatar 視為 LINE 的，
 * 否則 Google 登入第一次就會把它蓋掉。
 */
export const nextAvatars = (doc, provider, picture) => {
  const legacy = doc && typeof doc.avatar === 'string' && doc.provider !== 'google' ? doc.avatar : null
  const current = doc?.avatars && typeof doc.avatars === 'object' ? doc.avatars : { line: legacy, google: null }
  const avatars = {
    line: cleanAvatarUrl(current.line),
    google: cleanAvatarUrl(current.google),
    [provider]: cleanAvatarUrl(picture),
  }
  return { avatars, avatar: pickAvatar(avatars) }
}
