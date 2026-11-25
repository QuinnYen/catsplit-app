// 群組內頁共用底部導覽列：首頁／帳目／新增（中間凸起）／結算／頭像（帳號選單）。樣式比照個人記帳的 LedgerTabBar。
// active：目前頁對應的格子（'book' | 'add' | 'settle'），編輯頁等不屬於任何一格時傳 null。
import { useNavigate } from 'react-router-dom'
import { House, BookOpen, Plus, Scale } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import AvatarMenuTab from './AvatarMenu'

const GroupTabBar = ({ groupId, active = null }) => {
  const navigate = useNavigate()
  const { t } = useI18n()
  const base = `/group/${groupId}`
  const tabs = [
    { id: 'home', Icon: House, label: 'tab.home', to: '/' },
    { id: 'book', Icon: BookOpen, label: 'tab.groupBook', to: base },
    { id: 'add', Icon: Plus, label: 'tab.add', to: `${base}/add` },
    { id: 'settle', Icon: Scale, label: 'tab.settle', to: `${base}/settle` },
  ]

  return (
    <nav
      className="cs-tabbar"
      style={{
        background: 'var(--cs-card)', borderTop: '0.5px solid var(--cs-border)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', alignItems: 'end',
        padding: '6px 0 calc(6px + env(safe-area-inset-bottom, 0px))', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active
        const go = () => !isActive && navigate(tab.to)
        if (tab.id === 'add') {
          return (
            <button
              key={tab.id}
              onClick={go}
              aria-label={t(tab.label)}
              aria-current={isActive ? 'page' : undefined}
              style={{ background: 'none', border: 'none', cursor: isActive ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: -22, padding: '2px 0', WebkitTapHighlightColor: 'transparent' }}
            >
              <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--cs-rc-stamp)', display: 'grid', placeItems: 'center', boxShadow: '0 3px 10px rgba(0,0,0,0.25)' }}>
                <Plus size={26} color="var(--cs-rc-stamp-text)" strokeWidth={2.4} />
              </span>
              <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 600, color: 'var(--cs-rc-stamp)' }}>{t(tab.label)}</span>
            </button>
          )
        }
        const color = isActive ? 'var(--cs-rc-owe)' : 'var(--cs-text-sub)'
        return (
          <button
            key={tab.id}
            onClick={go}
            aria-label={t(tab.label)}
            aria-current={isActive ? 'page' : undefined}
            style={{ background: 'none', border: 'none', cursor: isActive ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '2px 0', WebkitTapHighlightColor: 'transparent' }}
          >
            <tab.Icon size={22} color={color} strokeWidth={isActive ? 2.4 : 1.8} />
            <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: isActive ? 700 : 500, color }}>{t(tab.label)}</span>
          </button>
        )
      })}
      <AvatarMenuTab />
    </nav>
  )
}

export default GroupTabBar
