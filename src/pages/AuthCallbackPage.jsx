import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const AuthCallbackPage = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { completeOAuthCallback } = useApp()
  const [error, setError] = useState(null)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const code = params.get('code')
    const state = params.get('state')
    const oauthError = params.get('error')

    if (oauthError) {
      setError(`授權失敗：${oauthError}`)
      return
    }
    if (!code || !state) {
      setError('缺少授權參數')
      return
    }

    completeOAuthCallback({ code, state })
      .then(() => {
        const redirect = localStorage.getItem('catsplit_redirect')
        localStorage.removeItem('catsplit_redirect')
        navigate(redirect || '/', { replace: true })
      })
      .catch((e) => {
        console.error(e)
        setError(`登入處理失敗：${e.message}`)
      })
  }, [params, completeOAuthCallback, navigate])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #fff8f4 0%, #ffe8d6 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🐱</div>
      {error ? (
        <>
          <div style={{ fontSize: 16, color: '#c0392b', marginBottom: 24, textAlign: 'center' }}>{error}</div>
          <button
            onClick={() => navigate('/', { replace: true })}
            style={{ background: '#fff', color: '#3d2b1f', border: '0.5px solid #f0d5c0', borderRadius: 12, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}
          >
            回首頁
          </button>
        </>
      ) : (
        <div style={{ fontSize: 14, color: '#b08060' }}>登入中…</div>
      )}
    </div>
  )
}

export default AuthCallbackPage
