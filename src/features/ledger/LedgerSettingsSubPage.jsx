// /ledger/settings/:section — 設定的獨立內頁：固定收支與轉帳（recurring）、預算（budget）、類別（categories）。
// 標題列有返回鍵（回設定「基本」分頁）；底部列照常顯示，「設定」維持高亮。
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { useI18n } from '../../i18n/I18nProvider'
import LedgerRecurringSettings from './LedgerRecurringSettings'
import LedgerBudgetSettings from './LedgerBudgetSettings'
import LedgerCategorySettings from './LedgerCategorySettings'

const SECTIONS = {
  recurring: { title: 'ledger.set.recurring', Body: LedgerRecurringSettings },
  budget: { title: 'ledger.set.budget', Body: LedgerBudgetSettings },
  categories: { title: 'ledger.set.categories', Body: LedgerCategorySettings },
}

const LedgerSettingsSubPage = () => {
  const { section } = useParams()
  const { t } = useI18n()
  const navigate = useNavigate()
  const s = SECTIONS[section]
  if (!s) return <Navigate to="/ledger/settings" replace />

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', color: 'var(--cs-rc-head-text)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/ledger/settings')} aria-label={t('ledger.settings.title')} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 26, lineHeight: 1, padding: 0, cursor: 'pointer', flexShrink: 0 }}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{t(s.title)}</div>
        </div>
      </div>
      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <s.Body />
      </div>
    </div>
  )
}

export default LedgerSettingsSubPage
