import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  uidFromLoginResponse, buildSessionUser, cachedLineUserId, canReuseCachedSession, isLineUserAgent, needsNicknameSetup,
} from './authSession.js'

const LINE = 'U' + 'a'.repeat(32)
const INTERNAL = 'u_00000000000000000001'

test('uidFromLoginResponse：優先用伺服器回傳的 uid，舊版後端只回 userId 時退回 userId', () => {
  assert.equal(uidFromLoginResponse({ uid: INTERNAL, userId: LINE }), INTERNAL)
  assert.equal(uidFromLoginResponse({ userId: LINE }), LINE)
})

test('buildSessionUser：uid 與 lineUserId 分開存', () => {
  assert.deepEqual(
    buildSessionUser({ uid: INTERNAL, lineUserId: LINE, name: 'A', avatar: 'https://a/b.png' }),
    { uid: INTERNAL, lineUserId: LINE, name: 'A', avatar: 'https://a/b.png' },
  )
})

test('cachedLineUserId：舊版快取沒有 lineUserId，uid 就是 LINE userId', () => {
  assert.equal(cachedLineUserId({ uid: LINE }), LINE)
  assert.equal(cachedLineUserId({ uid: INTERNAL, lineUserId: LINE }), LINE)
  assert.equal(cachedLineUserId(null), null)
})

const base = () => ({ cached: { uid: LINE, lineUserId: LINE }, firebaseUid: LINE, lineSub: LINE, hasPendingGuestNames: false })

test('快速路徑：現有使用者（uid 即 LINE userId，快取是舊格式）仍可沿用', () => {
  const args = base()
  args.cached = { uid: LINE }
  assert.equal(canReuseCachedSession(args), true)
})

test('快速路徑：uid 與 LINE userId 不同（帳號合併後）時，以 uid 與 lineUserId 分別比對', () => {
  assert.equal(canReuseCachedSession({
    cached: { uid: INTERNAL, lineUserId: LINE }, firebaseUid: INTERNAL, lineSub: LINE, hasPendingGuestNames: false,
  }), true)
})

test('快速路徑：LIFF 使用者被換掉就不沿用', () => {
  assert.equal(canReuseCachedSession({ ...base(), lineSub: 'U' + 'b'.repeat(32) }), false)
})

test('快速路徑：Firebase 沒恢復登入或 uid 不同就不沿用', () => {
  assert.equal(canReuseCachedSession({ ...base(), firebaseUid: undefined }), false)
  assert.equal(canReuseCachedSession({ ...base(), firebaseUid: INTERNAL }), false)
})

test('快速路徑：有待認領的訪客名字、沒有快取、快取是訪客、沒有 LIFF 使用者都不沿用', () => {
  assert.equal(canReuseCachedSession({ ...base(), hasPendingGuestNames: true }), false)
  assert.equal(canReuseCachedSession({ ...base(), cached: null }), false)
  assert.equal(canReuseCachedSession({ ...base(), cached: { uid: 'p_abc', guest: true } , firebaseUid: 'p_abc' }), false)
  assert.equal(canReuseCachedSession({ ...base(), lineSub: undefined }), false)
})

test('buildSessionUser：Google 使用者帶 provider，沒有 LINE userId', () => {
  const u = buildSessionUser({ uid: INTERNAL, name: 'Amy', avatar: null, provider: 'google' })
  assert.equal(u.provider, 'google')
  assert.equal(u.lineUserId, undefined)
  assert.equal('provider' in buildSessionUser({ uid: LINE, lineUserId: LINE, name: 'A', avatar: null }), false)
})

test('快速路徑：Google 使用者的快取在 LINE 內不會被當成同一個 LINE 使用者', () => {
  assert.equal(canReuseCachedSession({
    cached: { uid: INTERNAL, provider: 'google' }, firebaseUid: INTERNAL, lineSub: LINE, hasPendingGuestNames: false,
  }), false)
})

test('isLineUserAgent：LINE 內建瀏覽器與一般瀏覽器', () => {
  assert.equal(isLineUserAgent('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Line/14.0.0'), true)
  assert.equal(isLineUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36'), false)
  assert.equal(isLineUserAgent(undefined), false)
})

test('needsNicknameSetup：只有讀完雲端暱稱、仍沒有暱稱的 Google 使用者才需要設定', () => {
  const base = { provider: 'google', isGuest: false, nicknameReady: true, nickname: null }
  assert.equal(needsNicknameSetup(base), true)
  assert.equal(needsNicknameSetup({ ...base, nicknameReady: false }), false) // 還沒讀完，不能先判定
  assert.equal(needsNicknameSetup({ ...base, nickname: '小明' }), false)
  assert.equal(needsNicknameSetup({ ...base, provider: undefined }), false) // LINE 使用者有 LINE 名字可用
  assert.equal(needsNicknameSetup({ ...base, isGuest: true }), false)
})
