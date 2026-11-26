// 匯率計算機的底部導覽列：首頁／記帳／分帳／幣別／設定，五個樣式一致（沒有凸起鈕）。
// 訪客沒有個人記帳與設定：onLedger、onSettings 沒給就不顯示，剩下的平均分欄。
import { useNavigate } from 'react-router-dom'
import { House, BookOpen, Users, Coins, Settings } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'

const cell = { background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '2px 0', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }

// 底部列實際高度（不含 safe-area，實測 55）：頁面用它預留貼齊的空間
export const FX_TABBAR_HEIGHT = 55

const FxTabBar = ({ onLedger, onCurrencies, onSettings }) => {
  const navigate = useNavigate()
  const { t } = useI18n()
  const items = [
    { Icon: House, label: 'tab.home', onClick: () => navigate('/home') },
    onLedger && { Icon: BookOpen, label: 'tab.ledger', onClick: onLedger },
    { Icon: Users, label: 'tab.split', onClick: () => navigate('/') },
    { Icon: Coins, label: 'fx.tab.currencies', onClick: onCurrencies },
    onSettings && { Icon: Settings, label: 'fx.tab.settings', onClick: onSettings },
  ].filter(Boolean)
  return (
    <nav
      className="cs-tabbar"
      style={{
        background: 'var(--cs-card)', borderTop: '0.5px solid var(--cs-border)', display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, alignItems: 'end',
        padding: '6px 0 calc(6px + env(safe-area-inset-bottom, 0px))', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10,
      }}
    >
      {items.map(({ Icon, label, onClick }) => (
        <button key={label} onClick={onClick} aria-label={t(label)} style={cell}>
          <Icon size={22} color="var(--cs-text-sub)" strokeWidth={1.8} />
          <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 500, color: 'var(--cs-text-sub)' }}>{t(label)}</span>
        </button>
      ))}
    </nav>
  )
}

export default FxTabBar
