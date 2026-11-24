// 全站主導覽列：記帳／分帳／目標／匯率。只放在四大功能的第一層頁面（/ledger、/、/savings、/fx）；
// 群組內頁仍用 TabBar（首頁／群組／新增）。訪客只能用分帳與匯率，記帳與目標灰色，點了跳提示。
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { BookOpen, Users, PiggyBank, ArrowLeftRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'

const TABS = [
  { id: 'ledger', path: '/ledger', Icon: BookOpen, label: 'tab.ledger', needsAccount: true },
  { id: 'split', path: '/', Icon: Users, label: 'tab.split' },
  { id: 'goals', path: '/savings', Icon: PiggyBank, label: 'tab.goals', needsAccount: true },
  { id: 'fx', path: '/fx', Icon: ArrowLeftRight, label: 'tab.fx' },
]

const isActivePath = (tabPath, pathname) =>
  tabPath === '/' ? pathname === '/' : pathname === tabPath || pathname.startsWith(`${tabPath}/`)

const MainTabBar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useApp()
  const { t } = useI18n()
  const [notice, setNotice] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const showNotice = () => {
    setNotice(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setNotice(false), 2500)
  }

  return (
    <>
      {notice && (
        <div role="status" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--tabbar-h) + 16px + env(safe-area-inset-bottom, 0px))', zIndex: 11, margin: '0 auto', maxWidth: 360, background: 'var(--cs-rc-ink)', color: 'var(--cs-rc-bg)', borderRadius: 6, padding: '10px 14px', fontSize: 13, lineHeight: 1.5, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
          {t('tab.guestLocked')}
        </div>
      )}
      <nav className="cs-tabbar" style={{
        background: 'var(--cs-card)',
        borderTop: '0.5px solid var(--cs-border)',
        display: 'flex',
        padding: '6px 0 calc(6px + env(safe-area-inset-bottom, 0px))',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
      }}>
        {TABS.map(({ id, path, Icon, label, needsAccount }) => {
          const active = isActivePath(path, location.pathname)
          const locked = !!user?.guest && !!needsAccount
          const color = locked ? 'var(--cs-text-mute)' : active ? 'var(--cs-rc-owe)' : 'var(--cs-text-sub)'
          const onClick = () => {
            if (locked) return showNotice()
            if (!active) navigate(path)
          }
          return (
            <button
              key={id}
              aria-label={t(label)}
              aria-disabled={locked || undefined}
              aria-current={active ? 'page' : undefined}
              onClick={onClick}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: active && !locked ? 'default' : 'pointer', padding: '2px 0', opacity: locked ? 0.55 : 1, WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon size={22} color={color} strokeWidth={active ? 2.4 : 1.8} />
              <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: active ? 700 : 500, color }}>{t(label)}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}

export default MainTabBar
