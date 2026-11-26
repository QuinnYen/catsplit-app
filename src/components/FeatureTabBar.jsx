// 目標、匯率共用的簡單底部導覽列：首頁（回入口頁 /home）／可選的中間凸起動作鈕。
// 格子固定落在 5 欄的第 1、3 欄，和其他底部列的首頁、中間凸起鈕位置一致。
// action：{ label（i18n key）, to } 或 { label, onClick }（不跳頁、開面板時用）。
import { useNavigate } from 'react-router-dom'
import { House, Plus } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'

const FeatureTabBar = ({ action }) => {
  const navigate = useNavigate()
  const { t } = useI18n()
  const cell = { background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '2px 0', WebkitTapHighlightColor: 'transparent' }

  return (
    <nav
      className="cs-tabbar"
      style={{
        background: 'var(--cs-card)', borderTop: '0.5px solid var(--cs-border)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', alignItems: 'end',
        padding: '6px 0 calc(6px + env(safe-area-inset-bottom, 0px))', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10,
      }}
    >
      <button onClick={() => navigate('/home')} aria-label={t('tab.home')} style={{ ...cell, gridColumn: 1, cursor: 'pointer' }}>
        <House size={22} color="var(--cs-text-sub)" strokeWidth={1.8} />
        <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 500, color: 'var(--cs-text-sub)' }}>{t('tab.home')}</span>
      </button>
      {action && (
        <button onClick={() => (action.onClick ? action.onClick() : navigate(action.to))} aria-label={t(action.label)} style={{ ...cell, gridColumn: 3, cursor: 'pointer', marginTop: -22 }}>
          <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--cs-rc-stamp)', display: 'grid', placeItems: 'center', boxShadow: '0 3px 10px rgba(0,0,0,0.25)' }}>
            <Plus size={26} color="var(--cs-rc-stamp-text)" strokeWidth={2.4} />
          </span>
          <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 600, color: 'var(--cs-rc-stamp)' }}>{t(action.label)}</span>
        </button>
      )}
    </nav>
  )
}

export default FeatureTabBar
