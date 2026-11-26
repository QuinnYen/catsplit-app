// 匯率計算機的底部導覽列（版型同記帳的 LedgerTabBar：5 欄、第 3 欄中間凸起、設定在最右）：
// 首頁（回入口頁）／（空）／新增旅程（中間凸起）／幣別（獨立頁）／設定（齒輪）。
// 訪客沒有旅程與設定，onNewTrip、onSettings 沒給就不顯示。
import { useNavigate } from 'react-router-dom'
import { House, Plus, Coins, Settings } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'

// 含中間凸起鈕的實際高度（不含 safe-area）。固定下來，訪客（沒有凸起鈕）也一樣高，頁面才能精準貼齊在它上面
export const FX_TABBAR_HEIGHT = 59

const cell = { background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '2px 0', WebkitTapHighlightColor: 'transparent' }

const FxTabBar = ({ onNewTrip, onCurrencies, onSettings }) => {
  const navigate = useNavigate()
  const { t } = useI18n()
  const item = (Icon, label, onClick, column) => (
    <button onClick={onClick} aria-label={t(label)} style={{ ...cell, gridColumn: column, cursor: 'pointer' }}>
      <Icon size={22} color="var(--cs-text-sub)" strokeWidth={1.8} />
      <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 500, color: 'var(--cs-text-sub)' }}>{t(label)}</span>
    </button>
  )
  return (
    <nav
      className="cs-tabbar"
      style={{
        background: 'var(--cs-card)', borderTop: '0.5px solid var(--cs-border)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', alignItems: 'end',
        padding: '6px 0 calc(6px + env(safe-area-inset-bottom, 0px))', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10,
        minHeight: `calc(${FX_TABBAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      {item(House, 'tab.home', () => navigate('/home'), 1)}
      {onNewTrip && (
        <button onClick={onNewTrip} aria-label={t('fx.tab.addTrip')} style={{ ...cell, gridColumn: 3, cursor: 'pointer', marginTop: -22 }}>
          <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--cs-rc-stamp)', display: 'grid', placeItems: 'center', boxShadow: '0 3px 10px rgba(0,0,0,0.25)' }}>
            <Plus size={26} color="var(--cs-rc-stamp-text)" strokeWidth={2.4} />
          </span>
          <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 600, color: 'var(--cs-rc-stamp)' }}>{t('fx.tab.addTrip')}</span>
        </button>
      )}
      {item(Coins, 'fx.tab.currencies', onCurrencies, 4)}
      {onSettings && item(Settings, 'fx.tab.settings', onSettings, 5)}
    </nav>
  )
}

export default FxTabBar
