// Google 登入按鈕：載入 Google Identity Services，由 Google 畫出官方按鈕；使用者完成登入後以 ID token（credential）呼叫 onCredential。
// 登入畫面在 LINE 內建瀏覽器不顯示這個按鈕（常被擋），見 App.jsx
import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, GSI_SCRIPT_SRC } from '../config/google'
import { useI18n } from '../i18n/I18nProvider'

let gsiPromise = null
const loadGsi = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GSI_SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve(window.google)
      script.onerror = () => {
        gsiPromise = null
        script.remove()
        reject(new Error('gsi_load_failed'))
      }
      document.head.appendChild(script)
    })
  }
  return gsiPromise
}

const GoogleSignInButton = ({ onCredential, width = 320 }) => {
  const { t, lang } = useI18n()
  const holder = useRef(null)
  const [unavailable, setUnavailable] = useState(false)
  // callback 放在 ref，父元件重新渲染時不需要重新初始化按鈕
  const handler = useRef(onCredential)
  useEffect(() => { handler.current = onCredential })

  useEffect(() => {
    let cancelled = false
    loadGsi()
      .then((google) => {
        if (cancelled || !holder.current) return
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => handler.current?.(response.credential),
        })
        google.accounts.id.renderButton(holder.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width,
          locale: lang === 'en' ? 'en' : 'zh-TW',
        })
      })
      .catch((e) => {
        console.warn('Google Identity Services failed to load', e?.message || e)
        if (!cancelled) setUnavailable(true)
      })
    return () => { cancelled = true }
  }, [lang, width])

  if (unavailable) {
    return <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', textAlign: 'center', lineHeight: 1.6 }}>{t('login.googleUnavailable')}</div>
  }
  return <div ref={holder} style={{ minHeight: 44, display: 'flex', justifyContent: 'center' }} />
}

export default GoogleSignInButton
