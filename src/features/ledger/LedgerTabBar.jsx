// 帳本專用底部導覽列：首頁（回分帳）／帳本／記帳（中間凸起，開啟記帳面板）／帳戶／頭像（帳號選單）。
// 帳本設定在各頁標題列右上角的齒輪。
// 記帳有自己的導覽列；首頁回入口頁 /home。
import { useNavigate, useLocation } from 'react-router-dom'
import { House, BookOpen, Plus, CreditCard } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import AvatarMenuTab from '../../components/AvatarMenu'

const TABS = [
  { id: 'home', Icon: House, label: 'tab.home', to: '/home' },
  { id: 'book', Icon: BookOpen, label: 'ledger.tab.book', to: '/ledger', exact: true },
  { id: 'add', Icon: Plus, label: 'ledger.tab.add' },
  { id: 'accounts', Icon: CreditCard, label: 'ledger.tab.accounts', to: '/ledger/accounts' },
]

// 圖表頁是從帳本主頁右上角進去的，導覽列仍標示在「帳本」
const isActive = (tab, pathname) => {
  if (tab.id === 'book') return pathname === '/ledger' || pathname === '/ledger/stats'
  return !!tab.to && pathname === tab.to
}

const LedgerTabBar = ({ onAdd }) => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t } = useI18n()

  return (
    <nav
      className="cs-tabbar"
      style={{
        background: 'var(--cs-card)', borderTop: '0.5px solid var(--cs-border)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', alignItems: 'end',
        padding: '6px 0 calc(6px + env(safe-area-inset-bottom, 0px))', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10,
      }}
    >
      {TABS.map((tab) => {
        const active = isActive(tab, pathname)
        if (tab.id === 'add') {
          return (
            <button
              key={tab.id}
              onClick={onAdd}
              aria-label={t(tab.label)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: -22, padding: '2px 0', WebkitTapHighlightColor: 'transparent' }}
            >
              <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--cs-rc-stamp)', display: 'grid', placeItems: 'center', boxShadow: '0 3px 10px rgba(0,0,0,0.25)' }}>
                <Plus size={26} color="var(--cs-rc-stamp-text)" strokeWidth={2.4} />
              </span>
              <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 600, color: 'var(--cs-rc-stamp)' }}>{t(tab.label)}</span>
            </button>
          )
        }
        const color = active ? 'var(--cs-rc-owe)' : 'var(--cs-text-sub)'
        return (
          <button
            key={tab.id}
            onClick={() => !active && navigate(tab.to)}
            aria-label={t(tab.label)}
            aria-current={active ? 'page' : undefined}
            style={{ background: 'none', border: 'none', cursor: active ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '2px 0', WebkitTapHighlightColor: 'transparent' }}
          >
            <tab.Icon size={22} color={color} strokeWidth={active ? 2.4 : 1.8} />
            <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: active ? 700 : 500, color }}>{t(tab.label)}</span>
          </button>
        )
      })}
      <AvatarMenuTab />
    </nav>
  )
}

export default LedgerTabBar
