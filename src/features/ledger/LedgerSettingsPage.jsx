// /ledger/settings — 帳本設定，分頁呈現：「基本」（固定收支與固定轉帳、預算、支出與收入類別）、「進階」（週開始日、月開始日、年開始月、假日調整）、
// 「分帳」（連結群組、同步、匯入）、「資料」（匯出 CSV、備份與還原、重新計算餘額）。分頁狀態在網址 ?tab=。
// 帳本的改名與刪除在帳本選單（左上圓鈕）。
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/I18nProvider'
import LedgerRecurringSettings from './LedgerRecurringSettings'
import LedgerBudgetSettings from './LedgerBudgetSettings'
import LedgerCategorySettings from './LedgerCategorySettings'
import LedgerAdvancedSettings from './LedgerAdvancedSettings'
import LedgerGroupLinks from './LedgerGroupLinks'
import LedgerDataSettings from './LedgerDataSettings'

const TABS = [
  { key: 'basic', label: 'ledger.settings.tab.basic', render: () => <><LedgerRecurringSettings /><LedgerBudgetSettings /><LedgerCategorySettings /></> },
  { key: 'advanced', label: 'ledger.settings.tab.advanced', render: () => <LedgerAdvancedSettings /> },
  { key: 'group', label: 'ledger.settings.tab.group', render: () => <LedgerGroupLinks /> },
  { key: 'data', label: 'ledger.settings.tab.data', render: () => <LedgerDataSettings /> },
]

const tabButton = (active) => ({
  flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${active ? 'var(--cs-rc-stamp)' : 'transparent'}`, background: 'none',
  fontSize: 14, fontWeight: active ? 600 : 400, color: active ? 'var(--cs-text)' : 'var(--cs-text-sub)', cursor: 'pointer',
})

const LedgerSettingsPage = () => {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((x) => x.key === params.get('tab')) ?? TABS[0]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '20px 16px 22px', position: 'relative' }}>
        <div style={{ color: 'var(--cs-rc-head-text)', fontSize: 16, fontWeight: 500 }}>{t('ledger.settings.title')}</div>
      </div>
      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TABS.length > 1 && (
          <div role="tablist" style={{ display: 'flex', borderBottom: '0.5px solid var(--cs-border)' }}>
            {TABS.map((x) => (
              <button key={x.key} role="tab" aria-selected={tab.key === x.key} onClick={() => setParams({ tab: x.key }, { replace: true })} style={tabButton(tab.key === x.key)}>{t(x.label)}</button>
            ))}
          </div>
        )}

        {tab.render()}
      </div>
    </div>
  )
}

export default LedgerSettingsPage
