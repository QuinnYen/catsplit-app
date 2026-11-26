// 一級頁面（入口、分帳列表、目標、匯率、記帳）共用的頂部使用者列：頭像（38px）＋招呼語＋姓名＋小箭頭，
// 點了往下展開帳號選單（設定、官方帳號、登出）。right：右側的按鈕（例如記帳頁的帳本切換與圖表）。
import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import Avatar from './Avatar'
import { getGreeting } from '../utils/greeting'
import { useAccountMenu, menuItemStyle } from './useAccountMenu'

const UserHeader = ({ right, children }) => {
  const { user } = useApp()
  const { t } = useI18n()
  const [{ Icon: GreetingIcon, key: greetingKey }] = useState(getGreeting)
  const [pos, setPos] = useState(null) // null | { top, left }
  const btn = useRef(null)
  const items = useAccountMenu(() => setPos(null))

  const toggle = () => {
    if (pos) return setPos(null)
    const r = btn.current.getBoundingClientRect()
    setPos({ top: r.bottom + 10, left: Math.max(12, r.left) })
  }

  return (
    <>
    <div className="cs-header" style={{ background: 'var(--cs-rc-head)', color: 'var(--cs-rc-head-text)', padding: '20px 16px 22px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button
          ref={btn}
          onClick={toggle}
          aria-label={t('group.settings')}
          aria-haspopup="menu"
          aria-expanded={!!pos}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', minWidth: 0, WebkitTapHighlightColor: 'transparent' }}
        >
          <Avatar src={user?.avatar} name={user?.name} size={38} style={{ background: 'var(--cs-soft-2)', border: '2px solid var(--cs-rc-stamp)' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--cs-rc-head-text)', opacity: 0.75, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <GreetingIcon size={12} color="var(--cs-rc-stamp)" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(greetingKey)}</span>
            </div>
            <div style={{ color: 'var(--cs-rc-head-text)', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</span>
              <ChevronDown size={16} color="var(--cs-rc-head-text)" style={{ opacity: 0.8, flexShrink: 0, transform: pos ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </div>
          </div>
        </button>
        {right}
      </div>
      {children}
    </div>

    {/* 選單放在 header 外：.cs-header 的 mask 會裁掉範圍外（含 fixed）的內容 */}
      {pos && (
        <>
          <div onClick={() => setPos(null)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
          <div role="menu" style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 101, width: 220, background: 'var(--cs-rc-card)', borderRadius: 6, border: '0.5px solid var(--cs-rc-rule)', boxShadow: '0 6px 24px rgba(0,0,0,0.18)', padding: '2px 14px' }}>
            <div style={{ position: 'absolute', top: -6, left: 14, width: 12, height: 12, background: 'var(--cs-rc-card)', borderTop: '0.5px solid var(--cs-rc-rule)', borderLeft: '0.5px solid var(--cs-rc-rule)', transform: 'rotate(45deg)' }} />
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

export default UserHeader