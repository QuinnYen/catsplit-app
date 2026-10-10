import { useNavigate, useLocation } from 'react-router-dom'
import { House, Users, CirclePlus, Calculator } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'

// 導覽類（首頁、群組）用灰褐色；動作類（新增、結算）用主色，讓主要操作更醒目
const TAB_ICONS = {
  home: { Icon: House, label: 'tab.home' },
  group: { Icon: Users, label: 'tab.group' },
  add: { Icon: CirclePlus, label: 'tab.add', action: true },
  settle: { Icon: Calculator, label: 'tab.settle', action: true },
}

/**
 * TabBar - 共用底部導覽列
 *
 * context: 'home' | 'group' | 'expense' | 'settle' | 'create'
 * groupId: 當 context 為 group 相關頁面時傳入
 */
const TabBar = ({ context = 'home', groupId }) => {
  const navigate = useNavigate()
  const { t } = useI18n()
  const location = useLocation()

  const tabs = (() => {
    switch (context) {
      case 'create':
        return [
          { id: 'home', path: '/' },
        ]
      case 'group':
        return [
          { id: 'home', path: '/' },
          { id: 'add', path: `/group/${groupId}/add` },
          { id: 'settle', path: `/group/${groupId}/settle` },
        ]
      case 'expense':
        return [
          { id: 'home', path: '/' },
          { id: 'group', path: `/group/${groupId}` },
          { id: 'add', path: `/group/${groupId}/add` },
        ]
      case 'settle':
        return [
          { id: 'home', path: '/' },
          { id: 'group', path: `/group/${groupId}` },
        ]
      case 'transfer':
        return [
          { id: 'home', path: '/' },
          { id: 'group', path: `/group/${groupId}` },
        ]
      default:
        return []
    }
  })()

  return (
    <div style={{
      background: '#fff',
      borderTop: '0.5px solid #f0d5c0',
      display: 'flex',
      padding: '8px 0 calc(8px + env(safe-area-inset-bottom, 0px))',
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 10,
    }}>
      {tabs.map((tab, i) => {
        const isActive = location.pathname === tab.path
        const { Icon, action, label } = TAB_ICONS[tab.id]
        const color = isActive || action ? '#FF6B1A' : '#b08060'
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
              gap: 3,
              background: 'none',
              border: 'none',
              cursor: isActive ? 'default' : 'pointer',
              padding: '4px 0',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {Icon
              ? <Icon size={context === 'group' ? 30 : 26} color={color} strokeWidth={isActive ? 2.4 : 1.8} />
              : <span style={{ fontSize: 20, fontWeight: 600, color }}>{t(label)}</span>}
            {isActive && (
              <span style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: '#FF6B1A',
                display: 'block',
                marginTop: -1,
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

export default TabBar
