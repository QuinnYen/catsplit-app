import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanAvatarUrl, cleanName, pickAvatar, pickName, currentProfiles, nextProfile, mergeProfiles } from './profile.js'

const L = 'https://profile.line-scdn.net/a'
const G = 'https://lh3.googleusercontent.com/b'

test('cleanAvatarUrl：只收 https 且不超過 500 字，其他是 null', () => {
  assert.equal(cleanAvatarUrl(L), L)
  assert.equal(cleanAvatarUrl('http://x/a.png'), null)
  assert.equal(cleanAvatarUrl('javascript:alert(1)'), null)
  assert.equal(cleanAvatarUrl('https://x/' + 'a'.repeat(500)), null)
  assert.equal(cleanAvatarUrl(undefined), null)
})

test('cleanName：只收非空字串', () => {
  assert.equal(cleanName('Amy'), 'Amy')
  assert.equal(cleanName('  '), null)
  assert.equal(cleanName(undefined), null)
})

test('pickAvatar、pickName：LINE 優先，其次 Google，都沒有是 null', () => {
  assert.equal(pickAvatar({ line: L, google: G }), L)
  assert.equal(pickAvatar({ line: null, google: G }), G)
  assert.equal(pickAvatar({ line: 'bad', google: G }), G)
  assert.equal(pickAvatar(), null)
  assert.equal(pickName({ line: 'L', google: 'G' }), 'L')
  assert.equal(pickName({ line: '', google: 'G' }), 'G')
  assert.equal(pickName({}), null)
})

test('nextProfile：只更新這次登入方式的那一份；顯示用的永遠是 LINE 優先，provider 只在沒有 LINE 名字時是 google', () => {
  const doc = { names: { line: 'Lin', google: null }, avatars: { line: L, google: null }, provider: null }
  assert.deepEqual(nextProfile(doc, 'google', { name: 'Gina', picture: G }), {
    names: { line: 'Lin', google: 'Gina' }, avatars: { line: L, google: G }, name: 'Lin', avatar: L, provider: null,
  })
  // Google 先登入、之後 LINE 才綁上：LINE 登入後改成 LINE 的名稱、頭像，provider 清掉（不再強制設暱稱）
  const googleOnly = nextProfile(null, 'google', { name: 'Gina', picture: G })
  assert.deepEqual(googleOnly, { names: { line: null, google: 'Gina' }, avatars: { line: null, google: G }, name: 'Gina', avatar: G, provider: 'google' })
  assert.deepEqual(nextProfile(googleOnly, 'line', { name: 'Lin', picture: L }), {
    names: { line: 'Lin', google: 'Gina' }, avatars: { line: L, google: G }, name: 'Lin', avatar: L, provider: null,
  })
  // LINE 沒有頭像時頭像退回 Google，名稱仍用 LINE 的
  assert.deepEqual(nextProfile({ names: { line: 'Lin', google: 'Gina' }, avatars: { line: L, google: G } }, 'line', { name: 'Lin' }), {
    names: { line: 'Lin', google: 'Gina' }, avatars: { line: null, google: G }, name: 'Lin', avatar: G, provider: null,
  })
})

test('nextProfile：新帳號沒有名稱與頭像也能算', () => {
  assert.deepEqual(nextProfile(null, 'google', {}), { names: { line: null, google: null }, avatars: { line: null, google: null }, name: null, avatar: null, provider: null })
})

test('currentProfiles：舊資料沒有 names / avatars 時，非 google 的既有 name、avatar 視為 LINE 的', () => {
  assert.deepEqual(currentProfiles({ name: 'Lin', avatar: L }), { names: { line: 'Lin', google: null }, avatars: { line: L, google: null } })
  // 舊的 Google 帳號（provider google、avatar null）不會被誤當成 LINE
  assert.deepEqual(currentProfiles({ name: 'Gina', avatar: null, provider: 'google' }), { names: { line: null, google: null }, avatars: { line: null, google: null } })
  assert.deepEqual(currentProfiles(null), { names: { line: null, google: null }, avatars: { line: null, google: null } })
})

test('nextProfile：舊 LINE 使用者先用 Google 登入，不會把 LINE 的名稱與頭像蓋掉', () => {
  assert.deepEqual(nextProfile({ name: 'Lin', avatar: L }, 'google', { name: 'Gina', picture: G }), {
    names: { line: 'Lin', google: 'Gina' }, avatars: { line: L, google: G }, name: 'Lin', avatar: L, provider: null,
  })
})

test('mergeProfiles：兩邊各登入方式的資料取聯集，同一種兩邊都有以保留帳號為準', () => {
  const keepGoogle = { names: { line: null, google: 'Gina' }, avatars: { line: null, google: G }, provider: 'google' }
  const dropLine = { name: 'Lin', avatar: L } // 舊格式的 LINE 帳號
  assert.deepEqual(mergeProfiles(keepGoogle, dropLine), {
    names: { line: 'Lin', google: 'Gina' }, avatars: { line: L, google: G }, name: 'Lin', avatar: L, provider: null,
  })
  assert.equal(mergeProfiles({ names: { line: 'A', google: null } }, { names: { line: 'B', google: null } }).name, 'A')
  assert.equal(mergeProfiles(keepGoogle, undefined).name, 'Gina')
})
