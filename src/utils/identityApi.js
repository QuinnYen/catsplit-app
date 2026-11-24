// 身分綁定與合併的 API 呼叫：雲端函式 listIdentities、bindIdentity、executeMerge、unbindIdentity（見 docs/guides/identity-and-guests.md）。
// 網址由 VITE_TOKEN_EXCHANGE_URL（lineLogin 的網址）把結尾換掉推算，與其他雲端函式一致。

export class ApiError extends Error {
  constructor(code, status, data) {
    super(code)
    this.code = code
    this.status = status
    this.data = data
  }
}

export const apiUrl = (name, base) => (base ? base.replace('/lineLogin', `/${name}`) : null)

// baseUrl、fetchFn 可注入，測試用；預設是環境變數與瀏覽器的 fetch
// timeoutMs：請求（含讀取回應）超過這個時間就放棄並丟出 timeout，避免畫面永遠停在「處理中」
export const createIdentityApi = ({ baseUrl = import.meta.env?.VITE_TOKEN_EXCHANGE_URL, fetchFn = (...a) => fetch(...a), timeoutMs = 20000 } = {}) => {
  const call = async (name, idToken, body = {}) => {
    const url = apiUrl(name, baseUrl)
    if (!url) throw new ApiError('not_configured', 0, null)
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    try {
      let res
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(idToken && { Authorization: `Bearer ${idToken}` }) },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } catch {
        throw new ApiError(timedOut ? 'timeout' : 'network', 0, null)
      }
      const data = await res.json().catch(() => null)
      if (timedOut) throw new ApiError('timeout', 0, null)
      if (!res.ok) throw new ApiError(data?.error ?? `http_${res.status}`, res.status, data)
      return data
    } finally {
      clearTimeout(timer)
    }
  }
  return {
    listIdentities: (idToken) => call('listIdentities', idToken),
    // proof：{ provider: 'google', idToken } | { provider: 'line', code, redirectUri } | { provider: 'line', liffIdToken }
    bindIdentity: (idToken, proof) => call('bindIdentity', idToken, proof),
    executeMerge: (idToken, mergeId, resolutions) => call('executeMerge', idToken, { mergeId, resolutions }),
    unbindIdentity: (idToken, identityId) => call('unbindIdentity', idToken, { identityId }),
    // 在 LINE 內產生一次性連結碼（5 分鐘、單次），帶到外部瀏覽器兌換成同一個帳號的登入；兌換不需要登入
    createLinkCode: (idToken) => call('createLinkCode', idToken),
    redeemLinkCode: (code) => call('redeemLinkCode', null, { code }),
  }
}

export default createIdentityApi()
