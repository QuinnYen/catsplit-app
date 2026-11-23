// 設定頁的「登入方式」：列出已綁定的登入方式、綁定其他方式（Google、LINE）、解除綁定。
// 綁定到已經有資料的帳號時，雲端函式會回傳合併預覽，這裡存起來並導向 /merge 確認（見 MergePage）。
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import identityApi from '../utils/identityApi'
import { mergeErrorKey, savePreview } from '../utils/mergeUi'
import { isLineUserAgent } from '../utils/authSession'
import GoogleSignInButton from './GoogleSignInButton'

const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }
const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 8 }
const smallButton = { padding: '8px 12px', borderRadius: 6, border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-text)', fontSize: 13, cursor: 'pointer', flexShrink: 0 }

const LoginMethodsCard = () => {
  const { getIdToken, startLineBind, liffInstance } = useApp()
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [identities, setIdentities] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  // LINE 內產生的一次性連結 { url, expiresAtMs }：先顯示出來，再由使用者點「開啟瀏覽器」（或複製貼到瀏覽器）
  const [link, setLink] = useState(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState(null)
  // 合併完成後整頁重新載入會帶 ?merged=1；LINE 授權綁定完成跳回來會帶 ?bound=1（新增）或 ?bound=already（原本就綁了）；
  // 從 LINE 內帶到外部瀏覽器登入完成會帶 ?link=1（提示接著按 Google 按鈕）
  const [noticeKey, setNoticeKey] = useState(() => {
    if (params.get('merged') === '1') return 'identity.mergedDone'
    if (params.get('bound') === '1') return 'identity.bound'
    if (params.get('bound') === 'already') return 'identity.alreadyBound'
    if (params.get('link') === '1') return 'identity.linkedFromLine'
    return null
  })
  // context 的函式每次渲染都是新的，放進 ref，避免讀取清單的 effect 跟著重跑
  const tokenRef = useRef(getIdToken)
  useEffect(() => { tokenRef.current = getIdToken })

  const load = useCallback(async () => {
    try {
      const data = await identityApi.listIdentities(await tokenRef.current())
      setIdentities(data.identities)
      setLoadFailed(false)
    } catch (e) {
      console.warn('load identities failed', e?.code || e?.message || e)
      setLoadFailed(true)
      setIdentities((prev) => prev ?? [])
    }
  }, [])
  useEffect(() => { load() }, [load])
  // 回到這個頁面時重新讀清單：在外部瀏覽器綁完 Google 再切回 LINE，這裡才會看到
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const providerName = (provider) => t(`identity.provider.${provider}`)

  // 綁定的結果：新增完成就重新讀清單；對方是有資料的帳號就存預覽並到確認頁
  const handleBindResult = async (res, provider) => {
    if (res.status === 'merge_required') {
      savePreview(window.localStorage, res, provider)
      navigate('/merge')
      return
    }
    await load()
    setNoticeKey(res.status === 'bound' ? 'identity.bound' : 'identity.alreadyBound')
  }

  const run = async (action) => {
    setBusy(true)
    setErrorKey(null)
    setNoticeKey(null)
    try {
      await action()
    } catch (e) {
      console.error('identity action failed', e?.code || e)
      setErrorKey(mergeErrorKey(e?.code))
    } finally {
      setBusy(false)
    }
  }

  const handleGoogleCredential = (credential) => run(async () => {
    const res = await identityApi.bindIdentity(await tokenRef.current(), { provider: 'google', idToken: credential })
    await handleBindResult(res, 'google')
  })

  const handleUnbind = (identity) => {
    if (!confirm(t('identity.unbindConfirm', { provider: providerName(identity.provider) }))) return
    return run(async () => {
      await identityApi.unbindIdentity(await tokenRef.current(), identity.id)
      await load()
      setNoticeKey('identity.unbindDone')
    })
  }

  // LINE 內建瀏覽器無法用 Google 登入（Google 不允許在內嵌 WebView 登入）：產生一次性連結碼，
  // 在手機的瀏覽器開啟後用同一個帳號的登入狀態綁定 Google（見 LinkPage）。碼放在 # 後面，不會被送到伺服器。
  // 分兩步：先產生並顯示連結，再由使用者點「開啟瀏覽器」；自動開啟不一定成功（機型、LINE 版本），所以一定提供複製連結的備援
  const createLink = () => run(async () => {
    const { code, expiresAtMs } = await identityApi.createLinkCode(await tokenRef.current())
    setLinkCopied(false)
    setLink({ url: `${window.location.origin}/link#code=${code}`, expiresAtMs })
  })

  // 在使用者點擊當下直接呼叫，不等任何非同步工作
  const openLink = () => {
    setErrorKey(null)
    if (Date.now() >= link.expiresAtMs) {
      setLink(null)
      setErrorKey('identity.linkExpired')
      return
    }
    try {
      if (!liffInstance) throw new Error('liff_not_ready')
      liffInstance.openWindow({ url: link.url, external: true })
    } catch (e) {
      console.error('open link failed', e?.message || e)
      setErrorKey('identity.openFailed')
    }
  }

  const copyLink = async () => {
    setErrorKey(null)
    try {
      await navigator.clipboard.writeText(link.url)
      setLinkCopied(true)
    } catch {
      setErrorKey('identity.copyManual')
    }
  }

  if (identities === null) {
    return <div style={{ ...card, fontSize: 13, color: 'var(--cs-text-sub)' }}>{t('identity.loading')}</div>
  }

  const has = (provider) => identities.some((i) => i.provider === provider)
  const inLine = isLineUserAgent(navigator.userAgent)
  const canAddGoogle = !has('google')
  // LINE 內建瀏覽器登入的就是 LINE，沒有可以綁的；外部瀏覽器才提供綁定 LINE
  const canAddLine = !has('line') && !inLine

  return (
    <div style={card}>
      <div style={labelStyle}>{t('identity.title')}</div>
      <div style={{ fontSize: 11, color: 'var(--cs-text-sub)', lineHeight: 1.6, marginBottom: 10 }}>{t('identity.hint')}</div>

      {loadFailed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--cs-danger)', marginBottom: 10 }}>
          <span style={{ flex: 1 }}>{t('identity.loadFailed')}</span>
          <button onClick={load} style={smallButton}>{t('identity.retry')}</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {identities.map((identity) => (
          <div key={identity.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '0.5px solid var(--cs-border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--cs-text)', fontWeight: 500 }}>{providerName(identity.provider)}</div>
              {identity.createdAtMs && (
                <div style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{t('identity.linkedOn', { date: fmt.date(identity.createdAtMs) })}</div>
              )}
            </div>
            {identities.length > 1 && (
              <button onClick={() => handleUnbind(identity)} disabled={busy} style={{ ...smallButton, color: 'var(--cs-danger)', cursor: busy ? 'not-allowed' : 'pointer' }}>
                {t('identity.unbind')}
              </button>
            )}
          </div>
        ))}
      </div>

      {(canAddGoogle || canAddLine) && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--cs-border)' }}>
          <div style={labelStyle}>{t('identity.addTitle')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch', opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
            {canAddGoogle && !inLine && <GoogleSignInButton onCredential={handleGoogleCredential} width={280} />}
            {canAddGoogle && inLine && !link && (
              <>
                <button onClick={createLink} style={{ ...smallButton, padding: '11px 16px', fontSize: 14, fontWeight: 600 }}>{t('identity.addGoogleViaBrowser')}</button>
                <div style={{ fontSize: 11, color: 'var(--cs-text-sub)', lineHeight: 1.6 }}>{t('identity.viaBrowserHint')}</div>
              </>
            )}
            {canAddGoogle && inLine && link && (
              <>
                <div style={{ fontSize: 12, color: 'var(--cs-text)', lineHeight: 1.6 }}>{t('identity.linkReady')}</div>
                <button onClick={openLink} style={{ ...smallButton, padding: '11px 16px', fontSize: 14, fontWeight: 600, background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', border: 'none' }}>{t('identity.linkOpen')}</button>
                <div style={{ fontSize: 11, color: 'var(--cs-text-sub)', lineHeight: 1.6 }}>{t('identity.linkManual')}</div>
                <input
                  readOnly
                  value={link.url}
                  onFocus={(e) => e.target.select()}
                  aria-label={t('identity.linkCopy')}
                  style={{ border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: 'var(--cs-text-sub)', background: 'var(--cs-bg)', outline: 'none', minWidth: 0 }}
                />
                <button onClick={copyLink} style={smallButton}>{t('identity.linkCopy')}</button>
                {linkCopied && <div role="status" style={{ fontSize: 12, color: 'var(--cs-text)' }}>{t('identity.linkCopied')}</div>}
              </>
            )}
            {canAddLine && (
              <button
                onClick={startLineBind}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06C755', color: '#fff', border: 'none', borderRadius: 6, padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                {t('identity.addLine')}
              </button>
            )}
          </div>
        </div>
      )}

      {busy && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--cs-text-sub)' }}>{t('identity.working')}</div>}
      {errorKey && <div role="alert" style={{ marginTop: 10, fontSize: 12, color: 'var(--cs-danger)', lineHeight: 1.6 }}>{t(errorKey)}</div>}
      {noticeKey && <div role="status" style={{ marginTop: 10, fontSize: 12, color: 'var(--cs-text)', lineHeight: 1.6 }}>{t(noticeKey)}</div>}
    </div>
  )
}

export default LoginMethodsCard
