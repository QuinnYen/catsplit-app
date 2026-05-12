import { useNavigate, useLocation } from 'react-router-dom'

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
      case 'home':
        return [
          { emoji: '🏠', label: '首頁', path: '/' },
          { emoji: '➕', label: '建立群組', path: '/create' },
        ]
      case 'create':
        return [
          { emoji: '🏠', label: '首頁', path: '/' },
          { emoji: '➕', label: '建立群組', path: '/create' },
        ]
      case 'group':
        return [
          { emoji: '🏠', label: '首頁', path: '/' },
          { emoji: '💸', label: '新增支出', path: `/group/${groupId}/add` },
          { emoji: '🧮', label: '結算', path: `/group/${groupId}/settle` },
        ]
      case 'expense':
        return [
          { emoji: '🏠', label: '首頁', path: '/' },
          { emoji: '◀', label: '群組', path: `/group/${groupId}` },
          { emoji: '💸', label: '新增支出', path: `/group/${groupId}/add` },
        ]
      case 'settle':
        return [
          { emoji: '🏠', label: '首頁', path: '/' },
          { emoji: '◀', label: '群組', path: `/group/${groupId}` },
          { emoji: '🧮', label: '結算', path: `/group/${groupId}/settle` },
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
        return (
          <button
            key={i}
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
            <span style={{
              fontSize: 22,
              lineHeight: 1,
              filter: isActive ? 'none' : 'grayscale(30%)',
              opacity: isActive ? 1 : 0.5,
              transition: 'opacity 0.15s',
            }}>
              {tab.emoji}
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#FF6B1A' : '#b08060',
              transition: 'color 0.15s',
            }}>
              {tab.label}
            </span>
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
