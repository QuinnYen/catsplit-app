// /ledger/settings — 帳本設定（第一版）：目前帳本資訊與刪除。連結分帳群組與分類管理之後再做。
import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { deleteLedger } from '../../utils/ledgerApi'
import { useLedger } from './LedgerContext'

const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', fontSize: 14, color: 'var(--cs-text)' }

const LedgerSettingsPage = () => {
  const { ledger, ledgers, showToast } = useLedger()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isLast = ledgers.length <= 1

  const remove = async () => {
    if (isLast || busy || !window.confirm(t('ledger.settings.deleteConfirm', { name: ledger.name }))) return
    setBusy(true)
    setError('')
    try {
      await deleteLedger(ledger.id)
      showToast(t('ledger.settings.deleted'))
    } catch (e) {
      console.error('Failed to delete ledger', e)
      setError(t('ledger.settings.deleteFailed'))
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '20px 16px 22px', position: 'relative' }}>
        <div style={{ color: 'var(--cs-rc-head-text)', fontSize: 16, fontWeight: 500 }}>{t('ledger.settings.title')}</div>
      </div>
      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={card}>
          <div style={rowStyle}>
            <span style={{ color: 'var(--cs-text-sub)', fontSize: 13 }}>{t('ledger.settings.current')}</span>
            <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ledger.name}</span>
          </div>
          <div style={{ ...rowStyle, borderTop: '0.5px solid var(--cs-border)' }}>
            <span>
              {t('ledger.settings.baseCurrency')}
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-sub)', marginTop: 2 }}>{t('ledger.settings.locked')}</span>
            </span>
            <span style={{ color: 'var(--cs-text-sub)' }}>{ledger.baseCurrency}</span>
          </div>
        </div>

        <div style={{ ...card, fontSize: 13, color: 'var(--cs-text-mute)' }}>{t('ledger.settings.groupsSoon')}</div>

        <div style={card}>
          <button
            onClick={remove} disabled={isLast || busy}
            style={{ width: '100%', padding: '11px 0', borderRadius: 6, border: '1px solid var(--cs-danger)', background: 'transparent', color: 'var(--cs-danger)', fontSize: 14, fontWeight: 500, cursor: isLast || busy ? 'not-allowed' : 'pointer', opacity: isLast ? 0.5 : 1 }}
          >
            {busy ? t('ledger.settings.deleting') : t('ledger.settings.delete')}
          </button>
          {isLast && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--cs-text-mute)', textAlign: 'center' }}>{t('ledger.settings.deleteLast')}</div>}
          {error && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: 'var(--cs-danger)', textAlign: 'center' }}>{error}</div>}
        </div>
      </div>
    </div>
  )
}

export default LedgerSettingsPage
