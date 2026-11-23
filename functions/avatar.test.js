import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanAvatarUrl, pickAvatar, nextAvatars } from './avatar.js'

const L = 'https://profile.line-scdn.net/a'
const G = 'https://lh3.googleusercontent.com/b'

test('cleanAvatarUrl：只收 https 且不超過 500 字，其他是 null', () => {
  assert.equal(cleanAvatarUrl(L), L)
  assert.equal(cleanAvatarUrl('http://x/a.png'), null)
  assert.equal(cleanAvatarUrl('javascript:alert(1)'), null)
  assert.equal(cleanAvatarUrl('https://x/' + 'a'.repeat(500)), null)
  assert.equal(cleanAvatarUrl(undefined), null)
})

test('pickAvatar：LINE 優先，其次 Google，都沒有是 null', () => {
  assert.equal(pickAvatar({ line: L, google: G }), L)
  assert.equal(pickAvatar({ line: null, google: G }), G)
  assert.equal(pickAvatar({ line: 'bad', google: G }), G)
  assert.equal(pickAvatar({}), null)
  assert.equal(pickAvatar(), null)
})

test('nextAvatars：只更新這次登入方式的那一份，不蓋掉另一份；顯示用的永遠是 LINE 優先', () => {
  const doc = { avatars: { line: L, google: null }, avatar: L }
  assert.deepEqual(nextAvatars(doc, 'google', G), { avatars: { line: L, google: G }, avatar: L })
  // Google 先登入、之後 LINE 才綁上：LINE 登入後換成 LINE 的
  const googleOnly = { avatars: { line: null, google: G }, avatar: G }
  assert.deepEqual(nextAvatars(googleOnly, 'line', L), { avatars: { line: L, google: G }, avatar: L })
  // LINE 沒有頭像時退回 Google
  assert.deepEqual(nextAvatars({ avatars: { line: L, google: G } }, 'line', undefined), { avatars: { line: null, google: G }, avatar: G })
})

test('nextAvatars：沒有文件（新帳號）也能算', () => {
  assert.deepEqual(nextAvatars(null, 'google', G), { avatars: { line: null, google: G }, avatar: G })
  assert.deepEqual(nextAvatars(null, 'google', undefined), { avatars: { line: null, google: null }, avatar: null })
})

test('nextAvatars：舊資料沒有 avatars 時，既有的 avatar 視為 LINE 的，Google 登入不會把它蓋成 null', () => {
  assert.deepEqual(nextAvatars({ avatar: L, name: 'x' }, 'google', G), { avatars: { line: L, google: G }, avatar: L })
  assert.deepEqual(nextAvatars({ avatar: L }, 'line', L), { avatars: { line: L, google: null }, avatar: L })
  // 舊資料若是 Google 帳號（provider 為 google，avatar 為 null），不會誤當成 LINE
  assert.deepEqual(nextAvatars({ avatar: null, provider: 'google' }, 'google', G), { avatars: { line: null, google: G }, avatar: G })
})
