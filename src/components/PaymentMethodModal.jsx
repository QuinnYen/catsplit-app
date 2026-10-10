import { useState } from 'react'
import { Copy, ExternalLink, Check } from 'lucide-react'
import liff from '../config/liff'
import { getProvider, providerName, methodName, describeMethod } from '../config/paymentProviders'
import { useI18n } from '../i18n/I18nProvider'

const card = { background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }

// 一筆收款方式的內容：名稱、帳號／收款碼，可複製、開啟已安裝的 App
export const PaymentMethodBody = ({ method, heading }) => {
  const { t } = useI18n()
  const provider = getProvider(method.providerId)
  const [copied, setCopied] = useState(false)
  const url = provider?.openUrl?.(method.value) ?? null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url ?? method.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      alert(t('pay.copyFailed'))
    }
  }
  const open = () => {
    if (liff.isInClient()) liff.openWindow({ url, external: true })
    else window.location.assign(url)
  }

  return (
    <>
      {heading && <div style={{ fontSize: 12, color: '#b08060', marginBottom: 4 }}>{heading}</div>}
      <div style={{ fontSize: 16, fontWeight: 500, color: '#3d2b1f', marginBottom: 12 }}>{methodName(method, t)}{method.label ? `・${method.label}` : ''}</div>
      <div style={{ fontSize: 18, fontWeight: 500, color: '#FF6B1A', wordBreak: 'break-all', marginBottom: 16 }}>{describeMethod(method, t)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={copy} style={{ padding: '11px 0', borderRadius: 12, border: '0.5px solid #f0d5c0', background: '#fff8f4', color: '#3d2b1f', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {copied ? <><Check size={16} />{t('pay.copied')}</> : <><Copy size={16} />{t('pay.copy')}</>}
        </button>
        {provider?.kind === 'app' && (
          <>
            <button onClick={open} disabled={!url} style={{ padding: '11px 0', borderRadius: 12, border: 'none', background: url ? '#FF8C42' : '#e0cfc0', color: '#fff', fontSize: 14, fontWeight: 500, cursor: url ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ExternalLink size={16} />{t('pay.open', { name: providerName(provider, t) })}
            </button>
            {!url && <div style={{ fontSize: 11, color: '#c4a882', textAlign: 'center' }}>{t('pay.noOpenUrl')}</div>}
          </>
        )}
      </div>
    </>
  )
}

// 管理頁預覽用的彈窗
const PaymentMethodModal = ({ method, heading, onClose }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 320, padding: 20 }}>
      <PaymentMethodBody method={method} heading={heading} />
    </div>
  </div>
)

export default PaymentMethodModal
