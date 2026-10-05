import { useNavigate, useLocation } from 'react-router-dom'
import { House, Users, CirclePlus, Calculator } from 'lucide-react'

// 導覽類（首頁、群組）用灰褐色；動作類（新增、結算）用主色，讓主要操作更醒目
const TAB_ICONS = {
  '首頁': { Icon: House },
  '群組': { Icon: Users },
  '新增支出': { Icon: CirclePlus, action: true },
  '結算': { Icon: Calculator, action: true },
}

/**
 * TabBar - 共用底部導覽列
 *
 * context: 'home' | 'group' | 'expense' | 'settle' | 'create'
 * groupId: 當 context 為 group 相關頁面時傳入
 */
const TabBar = ({ context = 'home', groupId }) => {
  const navigate = useNavigate()
  const location = useLocation()

  const tabs = (() => {
    switch (context) {
      case 'create':
        return [
          { label: '首頁', path: '/' },
        ]
      case 'group':
        return [
          { label: '首頁', path: '/' },
          { label: '新增支出', path: `/group/${groupId}/add` },
          { label: '結算', path: `/group/${groupId}/settle` },
        ]
      case 'expense':
        return [
          { label: '首頁', path: '/' },
          { label: '群組', path: `/group/${groupId}` },
          { label: '新增支出', path: `/group/${groupId}/add` },
        ]
      case 'settle':
        return [
          { label: '首頁', path: '/' },
          { label: '群組', path: `/group/${groupId}` },
        ]
      case 'transfer':
        return [
          { label: '首頁', path: '/' },
          { label: '群組', path: `/group/${groupId}` },
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
        const { Icon, action } = TAB_ICONS[tab.label]
        const color = isActive || action ? '#FF6B1A' : '#b08060'
        return (
          <button
            key={i}
            aria-label={tab.label}
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
              : <span style={{ fontSize: 20, fontWeight: 600, color }}>{tab.label}</span>}
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
