// /auth/callback — LINE OAuth 登入回呼頁：用網址上的 code 與 state 完成登入，成功後導回原本要去的站內頁面。
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import GroupIcon from '../components/GroupIcon'

const AuthCallbackPage = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { completeOAuthCallback } = useApp()
  const { t } = useI18n()
  const [exchangeError, setError] = useState(null)
  const ranRef = useRef(false)

  const code = params.get('code')
  const state = params.get('state')
  const oauthError = params.get('error')
  const paramError = oauthError
    ? t('auth.failed', { error: oauthError })
    : (!code || !state) ? t('auth.missingParams') : null
  const error = paramError || exchangeError

  useEffect(() => {
    if (ranRef.current || paramError) return
    ranRef.current = true

    completeOAuthCallback({ code, state })
      .then(() => {
        const redirect = localStorage.getItem('catsplit_redirect')
        localStorage.removeItem('catsplit_redirect')
        // 只接受站內路徑，避免被塞入奇怪的值
        navigate(redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/', { replace: true })
      })
      .catch((e) => {
        console.error(e)
        setError(t('auth.processFailed', { message: e.message }))
      })
  }, [code, state, paramError, completeOAuthCallback, navigate, t])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #fff8f4 0%, #ffe8d6 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <GroupIcon icon="paw" color="orange" size={72} />
      </div>
      {error ? (
        <>
          <div style={{ fontSize: 16, color: '#c0392b', marginBottom: 24, textAlign: 'center' }}>{error}</div>
          <button
            onClick={() => navigate('/', { replace: true })}
            style={{ background: '#fff', color: '#3d2b1f', border: '0.5px solid #f0d5c0', borderRadius: 12, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}
          >
            {t('group.backHome')}
          </button>
        </>
      ) : (
        <div style={{ fontSize: 14, color: '#b08060' }}>{t('auth.signingIn')}</div>
      )}
    </div>
  )
}

export default AuthCallbackPage
