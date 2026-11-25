// /ledger/settings — 帳本設定，分頁呈現。目前只有「分帳」（連結群組、同步、匯入）；
// 「資料」（匯出 CSV）；其他分頁（基本、進階）做好一個加一個，只有一個分頁時不顯示分頁列。分頁狀態在網址 ?tab=。
// 帳本的改名與刪除在帳本選單（左上圓鈕）。
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from './LedgerContext'
import LedgerGroupLinks from './LedgerGroupLinks'
import LedgerDataSettings from './LedgerDataSettings'

const TABS = [
  { key: 'group', label: 'ledger.settings.tab.group', render: () => <LedgerGroupLinks /> },
  { key: 'data', label: 'ledger.settings.tab.data', render: () => <LedgerDataSettings /> },
]

const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', fontSize: 14, color: 'var(--cs-text)' }
const tabButton = (active) => ({
  flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${active ? 'var(--cs-rc-stamp)' : 'transparent'}`, background: 'none',
  fontSize: 14, fontWeight: active ? 600 : 400, color: active ? 'var(--cs-text)' : 'var(--cs-text-sub)', cursor: 'pointer',
})

const LedgerSettingsPage = () => {
  const { ledger } = useLedger()
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((x) => x.key === params.get('tab')) ?? TABS[0]

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
