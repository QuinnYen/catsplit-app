// 圖表：還在開發的頁面佔位（PR4）
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n/I18nProvider'

const LedgerPlaceholderPage = ({ titleKey, descKey, back = false }) => {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '20px 16px 22px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {back && (
            <button onClick={() => navigate('/ledger')} aria-label={t('ledger.tab.book')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
          )}
          <div style={{ color: 'var(--cs-rc-head-text)', fontSize: 16, fontWeight: 500 }}>{t(titleKey)}</div>
        </div>
      </div>
      <div className="cs-body" style={{ padding: 16 }}>
        <div style={{ textAlign: 'center', padding: '56px 16px', background: 'var(--cs-rc-card)', border: '1px dashed var(--cs-rc-rule)', borderRadius: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cs-rc-ink)', marginBottom: 8 }}>{t('comingSoon.title')}</div>
          <div style={{ fontSize: 13, color: 'var(--cs-rc-sub)', lineHeight: 1.6 }}>{t(descKey)}</div>
        </div>
      </div>
    </div>
  )
}

export default LedgerPlaceholderPage
