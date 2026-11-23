// 身分綁定與合併的 API 呼叫：雲端函式 listIdentities、bindIdentity、executeMerge、unbindIdentity（見 docs/identity-and-guests.md）。
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
export const createIdentityApi = ({ baseUrl = import.meta.env?.VITE_TOKEN_EXCHANGE_URL, fetchFn = (...a) => fetch(...a) } = {}) => {
  const call = async (name, idToken, body = {}) => {
    const url = apiUrl(name, baseUrl)
    if (!url) throw new ApiError('not_configured', 0, null)
    let res
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(body),
      })
    } catch {
      throw new ApiError('network', 0, null)
    }
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(data?.error ?? `http_${res.status}`, res.status, data)
    return data
  }
  return {
    listIdentities: (idToken) => call('listIdentities', idToken),
    // proof：{ provider: 'google', idToken } | { provider: 'line', code, redirectUri } | { provider: 'line', liffIdToken }
    bindIdentity: (idToken, proof) => call('bindIdentity', idToken, proof),
    executeMerge: (idToken, mergeId, resolutions) => call('executeMerge', idToken, { mergeId, resolutions }),
    unbindIdentity: (idToken, identityId) => call('unbindIdentity', idToken, { identityId }),
  }
}

export default createIdentityApi()
