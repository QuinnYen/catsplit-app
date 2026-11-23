// 本機模擬器測試用：攔截雲端函式對 LINE 驗證端點的 fetch，讓 verifyLiffToken 不用真的連 LINE。
// 只在啟動模擬器時以 NODE_OPTIONS 預載，不會被部署行為使用（見 docs/operations.md「本機模擬器跑雲端函式」）。
// 假的 id_token 直接當成 LINE userId（sub）回傳，例如 idToken = "U" + 32 位十六進位。
const realFetch = globalThis.fetch

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url
  if (url?.startsWith('https://api.line.me/oauth2/v2.1/verify')) {
    const idToken = new URLSearchParams(String(init?.body ?? '')).get('id_token') || ''
    return Response.json({ sub: idToken, name: `Mock ${idToken.slice(0, 6)}`, picture: 'https://example.com/avatar.png' })
  }
  return realFetch(input, init)
}
