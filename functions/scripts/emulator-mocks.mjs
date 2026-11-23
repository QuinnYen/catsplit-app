// 本機模擬器測試用：假冒需要連外驗證的兩個來源，讓雲端函式不用真的連 LINE 或 Google。
// 只在啟動模擬器時以 NODE_OPTIONS 預載，不會被部署行為使用（見 docs/operations.md「本機模擬器跑雲端函式」）。
//
// 1. LINE：攔截對 LINE 驗證端點的 fetch。假的 idToken 直接當成 LINE userId（sub），
//    例如 "U" + 32 位十六進位。
// 2. Google：取代 OAuth2Client.verifyIdToken。假的 idToken 直接當成 Google 的 sub（例如 "1122"）；
//    以 "bad" 開頭的 idToken 模擬簽章驗證失敗。
import { OAuth2Client } from 'google-auth-library'

const realFetch = globalThis.fetch

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url
  if (url?.startsWith('https://api.line.me/oauth2/v2.1/verify')) {
    const idToken = new URLSearchParams(String(init?.body ?? '')).get('id_token') || ''
    return Response.json({ sub: idToken, name: `Mock ${idToken.slice(0, 6)}`, picture: 'https://example.com/avatar.png' })
  }
  return realFetch(input, init)
}

OAuth2Client.prototype.verifyIdToken = async ({ idToken }) => {
  if (String(idToken).startsWith('bad')) throw new Error('mock: invalid signature')
  return {
    getPayload: () => ({ iss: 'https://accounts.google.com', sub: String(idToken), name: `Google ${idToken}`, email: `${idToken}@example.com` }),
  }
}
