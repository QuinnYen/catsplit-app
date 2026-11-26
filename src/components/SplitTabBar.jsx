// 分帳列表（/）的底部導覽列：首頁／收款／建立群組（中間凸起）／付款／匯率。
// 訪客不能建立群組，也沒有收款與付款方式：這三格變灰，點了提示。
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { House, QrCode, Plus, CreditCard, ArrowLeftRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'

const TABS = [
  { id: 'home', Icon: House, label: 'tab.home', to: '/home' },
  { id: 'receive', Icon: QrCode, label: 'tab.receive', to: '/payment-methods', needsAccount: true },
  { id: 'create', Icon: Plus, label: 'tab.createGroup', to: '/create', needsAccount: true },
  { id: 'pay', Icon: CreditCard, label: 'tab.pay', to: '/spend-methods', needsAccount: true },
  { id: 'fx', Icon: ArrowLeftRight, label: 'tab.fx', to: '/fx' },
]

const SplitTabBar = () => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
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

  const cell = { background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '2px 0', WebkitTapHighlightColor: 'transparent' }

  return (
    <>
      {notice && (
        <div role="status" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--tabbar-h) + 16px + env(safe-area-inset-bottom, 0px))', zIndex: 11, margin: '0 auto', maxWidth: 360, background: 'var(--cs-rc-ink)', color: 'var(--cs-rc-bg)', borderRadius: 6, padding: '10px 14px', fontSize: 13, lineHeight: 1.5, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
          {t('tab.guestLocked')}
        </div>
      )}
      <nav
        className="cs-tabbar"
        style={{
          background: 'var(--cs-card)', borderTop: '0.5px solid var(--cs-border)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', alignItems: 'end',
          padding: '6px 0 calc(6px + env(safe-area-inset-bottom, 0px))', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10,
        }}
      >
        {TABS.map((tab) => {
          const active = tab.to === pathname
          const locked = !!user?.guest && !!tab.needsAccount
          const go = () => {
            if (locked) return showNotice()
            if (!active) navigate(tab.to)
          }
          if (tab.id === 'create') {
            return (
              <button key={tab.id} onClick={go} aria-label={t(tab.label)} aria-disabled={locked || undefined} style={{ ...cell, cursor: 'pointer', marginTop: -22, opacity: locked ? 0.55 : 1 }}>
                <span style={{ width: 48, height: 48, borderRadius: '50%', background: locked ? 'var(--cs-text-mute)' : 'var(--cs-rc-stamp)', display: 'grid', placeItems: 'center', boxShadow: '0 3px 10px rgba(0,0,0,0.25)' }}>
                  <Plus size={26} color="var(--cs-rc-stamp-text)" strokeWidth={2.4} />
                </span>
                <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 600, color: locked ? 'var(--cs-text-mute)' : 'var(--cs-rc-stamp)' }}>{t(tab.label)}</span>
              </button>
            )
          }
          const color = locked ? 'var(--cs-text-mute)' : active ? 'var(--cs-rc-owe)' : 'var(--cs-text-sub)'
          return (
            <button key={tab.id} onClick={go} aria-label={t(tab.label)} aria-disabled={locked || undefined} aria-current={active ? 'page' : undefined} style={{ ...cell, cursor: active && !locked ? 'default' : 'pointer', opacity: locked ? 0.55 : 1 }}>
              <tab.Icon size={22} color={color} strokeWidth={active ? 2.4 : 1.8} />
              <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: active ? 700 : 500, color }}>{t(tab.label)}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}

export default SplitTabBar
