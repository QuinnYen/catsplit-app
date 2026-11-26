// 底部導覽列最右邊的頭像：圓圈右下角有小箭頭，點了從導覽列上方彈出帳號選單（設定、官方帳號、登出）。
// 各底部列（分帳列表、群組內頁、記帳…）都放同一個，帳號層級的入口因此在每個功能都找得到。
import { useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import Avatar from './Avatar'
import { useAccountMenu, menuItemStyle } from './useAccountMenu'

const AvatarMenuTab = ({ style }) => {
  const { user } = useApp()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const items = useAccountMenu(() => setOpen(false))

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t('group.settings')}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '2px 0', WebkitTapHighlightColor: 'transparent', ...style }}
      >
        <span style={{ position: 'relative', display: 'inline-flex', width: 26, height: 26, marginBottom: 2 }}>
          <Avatar src={user?.avatar} name={user?.name} size={26} style={{ background: 'var(--cs-soft-2)', border: '1.5px solid var(--cs-rc-stamp)' }} />
          <span style={{ position: 'absolute', right: -5, bottom: -4, width: 14, height: 14, borderRadius: '50%', background: 'var(--cs-card)', border: '0.5px solid var(--cs-border)', display: 'grid', placeItems: 'center' }}>
            <ChevronUp size={10} color="var(--cs-text-sub)" strokeWidth={3} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </span>
        </span>
        <span style={{ fontSize: 11, lineHeight: '14px', visibility: 'hidden' }} aria-hidden="true">.</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
          <div
            role="menu"
            style={{ position: 'fixed', bottom: 'calc(var(--tabbar-h) + 10px + env(safe-area-inset-bottom, 0px))', right: 'max(12px, calc((100% - 720px) / 2 + 12px))', zIndex: 101, width: 220, background: 'var(--cs-rc-card)', borderRadius: 6, border: '0.5px solid var(--cs-rc-rule)', boxShadow: '0 6px 24px rgba(0,0,0,0.18)', padding: '2px 14px' }}
          >
            <div style={{ position: 'absolute', bottom: -6, right: 18, width: 12, height: 12, background: 'var(--cs-rc-card)', borderBottom: '0.5px solid var(--cs-rc-rule)', borderRight: '0.5px solid var(--cs-rc-rule)', transform: 'rotate(45deg)' }} />
            {items.map(({ Icon, label, href, onClick }, i) => {
              const content = <><Icon size={18} color="var(--cs-rc-sub)" />{label}</>
              return href
                ? <a key={label} role="menuitem" href={href} style={menuItemStyle(i)}>{content}</a>
                : <button key={label} role="menuitem" onClick={onClick} style={menuItemStyle(i)}>{content}</button>
            })}
          </div>
        </>
      )}
    </>
  )
}

export default AvatarMenuTab
