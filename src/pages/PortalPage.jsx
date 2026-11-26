// /home — 入口頁：頂部使用者列加四個功能大按鈕（記帳、分帳、目標、匯率），沒有底部列。
// 訪客只能用分帳與匯率，記帳與目標灰色，點了跳提示。
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Users, PiggyBank, ArrowLeftRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import UserHeader from '../components/UserHeader'

const FEATURES = [
  { id: 'ledger', path: '/ledger', Icon: BookOpen, label: 'tab.ledger', needsAccount: true },
  { id: 'split', path: '/', Icon: Users, label: 'tab.split' },
  { id: 'goals', path: '/savings', Icon: PiggyBank, label: 'tab.goals', needsAccount: true },
  { id: 'fx', path: '/fx', Icon: ArrowLeftRight, label: 'tab.fx' },
]

const PortalPage = () => {
  const { user } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [notice, setNotice] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const showNotice = () => {
    setNotice(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setNotice(false), 2500)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-rc-bg)', paddingBottom: 24 }}>
      <UserHeader />

      <div className="cs-body" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {FEATURES.map(({ id, path, Icon, label, needsAccount }) => {
            const locked = !!user?.guest && !!needsAccount
            return (
              <button
                key={id}
                onClick={() => (locked ? showNotice() : navigate(path))}
                aria-disabled={locked || undefined}
                style={{ aspectRatio: '1 / 1', background: 'var(--cs-card)', border: '0.5px solid var(--cs-border)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, cursor: 'pointer', opacity: locked ? 0.55 : 1, WebkitTapHighlightColor: 'transparent' }}
              >
                <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--cs-soft-2)', display: 'grid', placeItems: 'center' }}>
                  <Icon size={30} color={locked ? 'var(--cs-text-mute)' : 'var(--cs-rc-stamp)'} strokeWidth={1.8} />
                </span>
                <span style={{ fontSize: 16, fontWeight: 600, color: locked ? 'var(--cs-text-mute)' : 'var(--cs-text)' }}>{t(label)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {notice && (
        <div role="status" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', zIndex: 11, margin: '0 auto', maxWidth: 360, background: 'var(--cs-rc-ink)', color: 'var(--cs-rc-bg)', borderRadius: 6, padding: '10px 14px', fontSize: 13, lineHeight: 1.5, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
          {t('tab.guestLocked')}
        </div>
      )}
    </div>
  )
}

export default PortalPage
