import { useNavigate, useLocation } from 'react-router-dom'
import { House } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'

/**
 * TabBar - 只剩「首頁」一格的底部列，給不屬於任何群組的頁面（建立群組、設定）。
 * 群組內頁用 GroupTabBar。
 */
const TabBar = () => {
  const navigate = useNavigate()
  const { t } = useI18n()
  const location = useLocation()
  const tabs = [{ id: 'home', path: '/home' }]
  const TAB_ICONS = { home: { Icon: House, label: 'tab.home' } }

  return (
    <div className="cs-tabbar" style={{
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
      {tabs.map((tab, i) => {
        const isActive = location.pathname === tab.path
        const { Icon, action, label } = TAB_ICONS[tab.id]
        const color = isActive || action ? 'var(--cs-rc-owe)' : 'var(--cs-text-sub)'
        return (
          <button
            key={i}
            aria-label={t(label)}
            onClick={() => !isActive && navigate(tab.path)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              background: 'none',
              border: 'none',
              cursor: isActive ? 'default' : 'pointer',
              padding: '2px 0',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Icon size={22} color={color} strokeWidth={isActive ? 2.4 : 1.8} />
            <span style={{
              fontSize: 11,
              lineHeight: '14px',
              fontWeight: isActive ? 700 : 500,
              color,
            }}>
              {t(label)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default TabBar
