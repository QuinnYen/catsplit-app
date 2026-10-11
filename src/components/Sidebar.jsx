// 桌機外殼（≥1024）的固定側欄：Logo、使用者選單、建立群組、群組清單（目前群組下展開群組內導覽）、封存收合。
// 只在 useIsDesktop() 為 true 時由 App 渲染；版面讓位（#root padding-left）寫在 src/index.css。
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Settings, QrCode, LogOut, ChevronDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import useMyGroups from '../hooks/useMyGroups'
import Avatar from './Avatar'
import GroupIcon from './GroupIcon'
import catLogo from '../assets/cat-logo.webp'

const itemStyle = (current) => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
  background: current ? '#fff3ec' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
  fontSize: 14, color: current ? '#FF6B1A' : '#3d2b1f', fontWeight: current ? 600 : 400, boxSizing: 'border-box',
})
const ellipsis = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

const Sidebar = () => {
  const { user, logout } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { groups } = useMyGroups()
  const [showMenu, setShowMenu] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const currentGroupId = pathname.match(/^\/group\/([^/]+)/)?.[1]
  const activeGroups = groups.filter(g => !g.archived)
  const archivedGroups = groups.filter(g => g.archived)

  const handleLogout = () => {
    if (confirm(user?.guest ? t('home.logoutConfirmGuest') : t('home.logoutConfirm'))) logout()
  }

  const renderGroup = (group) => {
    const isCurrent = group.id === currentGroupId
    const sub = [
      { label: t('kind.expense'), path: `/group/${group.id}` },
      { label: t('tab.add'), path: `/group/${group.id}/add` },
      { label: t('stats.title'), path: `/group/${group.id}/stats` },
      { label: t('tab.settle'), path: `/group/${group.id}/settle` },
      { label: t('group.menu.edit'), path: `/group/${group.id}/edit` },
    ]
    return (
      <div key={group.id}>
        <button onClick={() => navigate(`/group/${group.id}`)} aria-current={isCurrent ? 'true' : undefined} style={itemStyle(isCurrent)}>
          <GroupIcon icon={group.icon} color={group.iconColor} size={28} />
          <span style={ellipsis}>{group.name}</span>
        </button>
        {isCurrent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0 4px 38px' }}>
            {sub.map(({ label, path }) => {
              const active = pathname === path
              return (
                <button key={path} onClick={() => navigate(path)} aria-current={active ? 'page' : undefined} style={{ ...itemStyle(active), padding: '6px 10px', fontSize: 13 }}>
                  <span style={ellipsis}>{label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <nav style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 'var(--sb-w)', boxSizing: 'border-box', zIndex: 20, background: '#fff', borderRight: '0.5px solid #f0d5c0', overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px' }}>
        <img src={catLogo} alt="" style={{ width: 32, height: 32 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#3d2b1f' }}>{t('app.title')}</span>
      </div>

      {/* 使用者選單 */}
      <div style={{ borderBottom: '0.5px solid #f0d5c0', paddingBottom: 12 }}>
        <button onClick={() => setShowMenu(v => !v)} aria-expanded={showMenu} style={itemStyle(false)}>
          <Avatar src={user?.avatar} name={user?.name} size={32} />
          <span style={{ ...ellipsis, fontWeight: 500 }}>{user?.name}</span>
          <ChevronDown size={16} color="#b08060" style={{ transform: showMenu ? 'rotate(180deg)' : 'none' }} />
        </button>
        {showMenu && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
            {[
              { Icon: Settings, label: t('group.settings'), onClick: () => navigate('/settings') },
              // 訪客沒有穩定身分，不提供收款方式
              ...(!user?.guest ? [{ Icon: QrCode, label: t('home.menu.payment'), onClick: () => navigate('/payment-methods') }] : []),
              { Icon: LogOut, label: t('home.menu.logout'), onClick: handleLogout },
            ].map(({ Icon, label, onClick }) => (
              <button key={label} onClick={onClick} style={{ ...itemStyle(false), fontSize: 13 }}>
                <Icon size={16} color="#b08060" />{label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!user?.guest && (
        <button
          onClick={() => navigate('/create')}
          aria-current={pathname === '/create' ? 'page' : undefined}
          style={{ background: '#FF8C42', color: '#fff', border: 'none', borderRadius: 20, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          {t('home.create')}
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 12, color: '#b08060', fontWeight: 500, padding: '0 10px 4px' }}>{t('tab.group')}</div>
        {activeGroups.map(renderGroup)}
      </div>

      {archivedGroups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button onClick={() => setShowArchived(v => !v)} aria-expanded={showArchived} style={{ ...itemStyle(false), fontSize: 12, color: '#b08060' }}>
            <span style={ellipsis}>{t('home.archived', { n: archivedGroups.length })}</span>
            <ChevronDown size={14} style={{ transform: showArchived ? 'rotate(180deg)' : 'rotate(-90deg)' }} />
          </button>
          {showArchived && <div style={{ opacity: 0.65 }}>{archivedGroups.map(renderGroup)}</div>}
        </div>
      )}
    </nav>
  )
}

export default Sidebar
