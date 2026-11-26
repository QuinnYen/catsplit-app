// /fx/settings — 計算機設定（截圖 2）：小數位數、預設金額、顯示幣別符號、免稅與刷卡百分比。選了或輸入完立刻儲存，存雲端（換裝置不用重設）。
// 自訂匯率在 /fx/settings/rates（FxRatesPage）。
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import { useFxSettings } from './hooks'
import { saveFxSettings, resetFxSettings } from './data'
import { parseSetting, listCustomRates } from './fxSettings'
import { DEFAULT_FX_SETTINGS } from './fxMath'
import { useLedger } from '../ledger/LedgerContext'
import { trashedTrips } from './trash'

const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)' }
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderBottom: '0.5px solid var(--cs-border)' }
const labelStyle = { fontSize: 14, color: 'var(--cs-text)' }
const hintStyle = { fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.6, marginTop: 2 }
const controlStyle = { border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '8px 10px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-bg)', outline: 'none', textAlign: 'right' }

// 數字輸入列：離開輸入框時驗證並儲存，不合法就還原並提示。外面用 key 帶上目前的值，雲端值改變時重新帶入
const NumberRow = ({ field, label, hint, value, suffix, onSave }) => {
  const { t } = useI18n()
  const [text, setText] = useState(String(value))
  const [error, setError] = useState('')
  const commit = async () => {
    const r = parseSetting(field, text)
    if (!r.ok) {
      setError(t(`fx.settings.err.${r.reason}`))
      setText(String(value))
      return
    }
    setError('')
    setText(String(r.value))
    if (r.value !== value) await onSave({ [field]: r.value })
  }
  return (
    <div style={rowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={labelStyle}>{label}</div>
        {hint && <div style={hintStyle}>{hint}</div>}
        {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)', marginTop: 2 }}>{error}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <input
          value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          inputMode="decimal" aria-label={label} style={{ ...controlStyle, width: 84 }}
        />
        {suffix && <span style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>{suffix}</span>}
      </div>
    </div>
  )
}

const FxSettingsPage = () => {
  const { user } = useApp()
  const uid = user.uid
  const { t } = useI18n()
  const navigate = useNavigate()
  const { settings, ready } = useFxSettings(uid)
  const { trips } = useLedger()
  const [error, setError] = useState('')

  const save = async (patch) => {
    setError('')
    try {
      await saveFxSettings(uid, patch)
    } catch (e) {
      console.error('Failed to save fx settings', e)
      setError(t('fx.settings.failed'))
    }
  }
  const reset = async () => {
    if (!window.confirm(t('fx.settings.resetConfirm'))) return
    setError('')
    try {
      await resetFxSettings(uid)
    } catch (e) {
      console.error('Failed to reset fx settings', e)
      setError(t('fx.settings.failed'))
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', color: 'var(--cs-rc-head-text)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/fx')} aria-label={t('tab.fx')} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 26, lineHeight: 1, padding: 0, cursor: 'pointer', flexShrink: 0 }}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{t('fx.settings.title')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!ready ? <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div> : (
          <>
            <div style={{ fontSize: 13, color: 'var(--cs-text-sub)', paddingLeft: 4 }}>{t('fx.settings.calc')}</div>
            <div style={{ ...card, overflow: 'hidden' }}>
              <label style={rowStyle}>
                <span style={labelStyle}>{t('fx.settings.decimals')}</span>
                <select value={settings.decimals} onChange={(e) => save({ decimals: Number(e.target.value) })} aria-label={t('fx.settings.decimals')} style={controlStyle}>
                  {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{t('fx.settings.decimalsN', { n })}</option>)}
                </select>
              </label>
              <NumberRow key={`defaultAmount:${settings.defaultAmount}`} field="defaultAmount" label={t('fx.settings.defaultAmount')} hint={t('fx.settings.defaultAmountHint')} value={settings.defaultAmount} onSave={save} />
              <label style={rowStyle}>
                <span style={labelStyle}>{t('fx.settings.showSymbol')}</span>
                <input type="checkbox" role="switch" checked={settings.showSymbol} onChange={(e) => save({ showSymbol: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--cs-rc-stamp)', flexShrink: 0 }} />
              </label>
              <NumberRow key={`taxFreePercent:${settings.taxFreePercent}`} field="taxFreePercent" label={t('fx.settings.taxFree')} hint={t('fx.settings.taxFreeHint')} value={settings.taxFreePercent} suffix="%" onSave={save} />
              <NumberRow key={`cardFeePercent:${settings.cardFeePercent}`} field="cardFeePercent" label={t('fx.settings.cardFee')} hint={t('fx.settings.cardFeeHint')} value={settings.cardFeePercent} suffix="%" onSave={save} />
              <button onClick={() => navigate('/fx/settings/rates')} style={{ ...rowStyle, width: '100%', background: 'none', border: 'none', cursor: 'pointer', borderBottom: 'none', textAlign: 'left' }}>
                <span style={labelStyle}>{t('fx.settings.customRates')}</span>
                <span style={{ fontSize: 14, color: 'var(--cs-text-sub)' }}>{t('fx.settings.customRatesCount', { n: listCustomRates(settings.customRates).length })} ›</span>
              </button>
              <button onClick={() => navigate('/fx/trash')} style={{ ...rowStyle, width: '100%', background: 'none', border: 'none', cursor: 'pointer', borderBottom: 'none', borderTop: '0.5px solid var(--cs-border)', textAlign: 'left' }}>
                <span style={labelStyle}>{t('fx.settings.trash')}</span>
                <span style={{ fontSize: 14, color: 'var(--cs-text-sub)' }}>{t('fx.settings.trashCount', { n: trashedTrips(trips).length })} ›</span>
              </button>
            </div>
            {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}
            <button onClick={reset} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: 'pointer' }}>{t('fx.settings.reset')}</button>
            <div style={hintStyle}>{t('fx.settings.resetHint', { decimals: DEFAULT_FX_SETTINGS.decimals, tax: DEFAULT_FX_SETTINGS.taxFreePercent, fee: DEFAULT_FX_SETTINGS.cardFeePercent })}</div>
          </>
        )}
      </div>
    </div>
  )
}

export default FxSettingsPage
