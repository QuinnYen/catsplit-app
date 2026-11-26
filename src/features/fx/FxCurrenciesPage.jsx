// /fx/currencies — 幣別：計算機顯示哪些幣別、順序、自訂匯率。底部列的「幣別」進來，標題列返回計算機。
// 換算列跟著目前選的旅程（沒選旅程就是共用的那一份）；自訂匯率存在帳號設定（users/{uid}/settings/fx 的 customRates）。
// 訪客只能調整換算列（存本機），不能自訂匯率。
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import { useState } from 'react'
import CurrencyEditor from './CurrencyEditor'
import { useFxCalc } from './useFxCalc'
import { useFxSettings } from './hooks'
import { saveCustomRates } from './data'
import { defaultRows, sanitizeRows } from './fxMath'
import { readLocalCalc, writeLocalCalc } from './fxLocalPrefs'

const Shell = ({ title, subtitle, children }) => {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 24 }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', color: 'var(--cs-rc-head-text)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/fx')} aria-label={t('tab.fx')} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 26, lineHeight: 1, padding: 0, cursor: 'pointer', flexShrink: 0 }}>‹</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
          </div>
        </div>
      </div>
      <div className="cs-body" style={{ padding: 16, maxWidth: 560 }}>{children}</div>
    </div>
  )
}

const FxCurrenciesPage = () => {
  const { t } = useI18n()
  const calc = useFxCalc()
  const { settings, ready } = useFxSettings(calc.uid)
  if (!calc.tripsReady || !ready) return <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', display: 'grid', placeItems: 'center', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>
  return (
    <Shell title={t('fx.cur.title')} subtitle={calc.current ? t('fx.cur.forTrip', { name: calc.current.name }) : t('fx.cur.forAll')}>
      <CurrencyEditor
        base={calc.base} rows={calc.rows} onRowsChange={(rows) => calc.save({ rows })}
        customRates={settings.customRates}
        onCustomRatesChange={(next) => saveCustomRates(calc.uid, next).catch((e) => console.error('Failed to save custom rates', e))}
      />
    </Shell>
  )
}

// 訪客：換算列存本機，沒有自訂匯率
export const FxCurrenciesGuest = () => {
  const { t } = useI18n()
  const { user } = useApp()
  const [local, setLocal] = useState(() => readLocalCalc(localStorage, user.uid))
  const rows = sanitizeRows(local.rows) ?? defaultRows(null, 'TWD')
  return (
    <Shell title={t('fx.cur.title')} subtitle={t('fx.cur.forAll')}>
      <CurrencyEditor
        base="TWD" rows={rows} customRates={null} onCustomRatesChange={() => {}}
        onRowsChange={(next) => { writeLocalCalc(localStorage, user.uid, { rows: next }); setLocal((prev) => ({ ...prev, rows: next })) }}
      />
    </Shell>
  )
}

export default FxCurrenciesPage
