// /fx/settings — 計算機設定，分「基本」（小數位數、預設金額、符號）與「捷徑」（刷卡、免稅、服務費、外加稅、小費的百分比，加上自訂捷徑）兩個分頁。
// 選了或輸入完立刻儲存，存雲端（換裝置不用重設）。分頁狀態在網址 ?tab=。
// 自訂匯率在「幣別」頁（/fx/currencies，每種幣別直接設）。
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import FxHomeButton from './FxHomeButton'
import { useFxSettings } from './hooks'
import { saveFxSettings, saveCustomShortcuts, resetFxSettings } from './data'
import { parseSetting, parseShortcut, MAX_SHORTCUTS, SHORTCUT_NAME_MAX } from './fxSettings'

const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)' }
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderBottom: '0.5px solid var(--cs-border)' }
const labelStyle = { fontSize: 14, color: 'var(--cs-text)' }
const hintStyle = { fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.6, marginTop: 2 }
const tabButton = (active) => ({
  flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${active ? 'var(--cs-rc-stamp)' : 'transparent'}`, background: 'none',
  fontSize: 14, fontWeight: active ? 600 : 400, color: active ? 'var(--cs-text)' : 'var(--cs-text-sub)', cursor: 'pointer',
})
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

// 自訂捷徑的一列：名稱、百分比、加收或扣除，離開輸入框時驗證並儲存；不合法就還原並提示。外面用 key 帶上目前的值
const ShortcutRow = ({ item, onChange, onRemove }) => {
  const { t } = useI18n()
  const [name, setName] = useState(item.name)
  const [percent, setPercent] = useState(String(item.percent))
  const [error, setError] = useState('')
  const commit = (patch = {}) => {
    const r = parseShortcut({ name, percent, kind: item.kind, ...patch })
    if (!r.ok) {
      setError(t(r.reason === 'name' ? 'fx.settings.err.shortcutName' : 'fx.settings.err.shortcutPercent'))
      setName(item.name)
      setPercent(String(item.percent))
      return
    }
    setError('')
    setName(r.value.name)
    setPercent(String(r.value.percent))
    if (r.value.name !== item.name || r.value.percent !== item.percent || r.value.kind !== item.kind) onChange({ id: item.id, ...r.value })
  }
  const blurOnEnter = (e) => e.key === 'Enter' && e.currentTarget.blur()
  return (
    <div style={{ ...rowStyle, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => commit()} onKeyDown={blurOnEnter} maxLength={SHORTCUT_NAME_MAX} aria-label={t('fx.settings.shortcut.name')} style={{ ...controlStyle, textAlign: 'left', width: 84 }} />
        <select value={item.kind} onChange={(e) => commit({ kind: e.target.value })} aria-label={t('fx.settings.shortcut.kind')} style={controlStyle}>
          <option value="add">{t('fx.settings.shortcut.add')}</option>
          <option value="deduct">{t('fx.settings.shortcut.deduct')}</option>
        </select>
        <input value={percent} onChange={(e) => setPercent(e.target.value)} onBlur={() => commit()} onKeyDown={blurOnEnter} inputMode="decimal" aria-label={t('fx.settings.shortcut.percent')} style={{ ...controlStyle, width: 52 }} />
        <span style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>%</span>
      </div>
      <button onClick={onRemove} aria-label={t('fx.settings.shortcut.remove', { name: item.name })} style={{ background: 'none', border: 'none', color: 'var(--cs-danger)', fontSize: 13, cursor: 'pointer', padding: '8px 0' }}>{t('common.delete')}</button>
      {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)', width: '100%' }}>{error}</div>}
    </div>
  )
}

// 新增自訂捷徑的表單
const NewShortcut = ({ disabled, onAdd }) => {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [percent, setPercent] = useState('')
  const [kind, setKind] = useState('add')
  const [error, setError] = useState('')
  const submit = () => {
    const r = parseShortcut({ name, percent, kind })
    if (!r.ok) return setError(t(r.reason === 'name' ? 'fx.settings.err.shortcutName' : 'fx.settings.err.shortcutPercent'))
    setError('')
    onAdd(r.value)
    setName('')
    setPercent('')
  }
  return (
    <div style={{ ...rowStyle, borderBottom: 'none', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={SHORTCUT_NAME_MAX} placeholder={t('fx.settings.shortcut.name')} aria-label={t('fx.settings.shortcut.newName')} style={{ ...controlStyle, textAlign: 'left', width: 84 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('fx.settings.shortcut.newKind')} style={controlStyle}>
          <option value="add">{t('fx.settings.shortcut.add')}</option>
          <option value="deduct">{t('fx.settings.shortcut.deduct')}</option>
        </select>
        <input value={percent} onChange={(e) => setPercent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} inputMode="decimal" placeholder="%" aria-label={t('fx.settings.shortcut.newPercent')} style={{ ...controlStyle, width: 52 }} />
        <span style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>%</span>
      </div>
      <button onClick={submit} disabled={disabled} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>{t('fx.settings.shortcut.addButton')}</button>
      {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)', width: '100%' }}>{error}</div>}
    </div>
  )
}

const FxSettingsPage = () => {
  const { user } = useApp()
  const uid = user.uid
  const { t } = useI18n()
  const navigate = useNavigate()
  const { settings, ready } = useFxSettings(uid)
  const [error, setError] = useState('')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'shortcuts' ? 'shortcuts' : 'basic'

  const save = async (patch) => {
    setError('')
    try {
      await saveFxSettings(uid, patch)
    } catch (e) {
      console.error('Failed to save fx settings', e)
      setError(t('fx.settings.failed'))
    }
  }
  // 自訂捷徑：整份清單一起存（id 在新增時產生）
  const saveShortcuts = async (next) => {
    setError('')
    try {
      await saveCustomShortcuts(uid, next)
    } catch (e) {
      console.error('Failed to save custom shortcuts', e)
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
          <div style={{ flex: 1 }} />
          <FxHomeButton />
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!ready ? <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div> : (
          <>
            <div role="tablist" style={{ display: 'flex', borderBottom: '0.5px solid var(--cs-border)' }}>
              {['basic', 'shortcuts'].map((key) => (
                <button key={key} role="tab" aria-selected={tab === key} onClick={() => setParams({ tab: key }, { replace: true })} style={tabButton(tab === key)}>{t(`fx.settings.tab.${key}`)}</button>
              ))}
            </div>

            {tab === 'basic' && (
              <div style={{ ...card, overflow: 'hidden' }}>
                <label style={rowStyle}>
                  <span style={labelStyle}>{t('fx.settings.decimals')}</span>
                  <select value={settings.decimals} onChange={(e) => save({ decimals: Number(e.target.value) })} aria-label={t('fx.settings.decimals')} style={controlStyle}>
                    {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{t('fx.settings.decimalsN', { n })}</option>)}
                  </select>
                </label>
                <NumberRow key={`defaultAmount:${settings.defaultAmount}`} field="defaultAmount" label={t('fx.settings.defaultAmount')} hint={t('fx.settings.defaultAmountHint')} value={settings.defaultAmount} onSave={save} />
                <label style={{ ...rowStyle, borderBottom: 'none' }}>
                  <span style={labelStyle}>{t('fx.settings.showSymbol')}</span>
                  <input type="checkbox" role="switch" checked={settings.showSymbol} onChange={(e) => save({ showSymbol: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--cs-rc-stamp)', flexShrink: 0 }} />
                </label>
              </div>
            )}

            {tab === 'shortcuts' && (
              <>
                <div style={{ ...card, overflow: 'hidden' }}>
                  {[
                    ['cardFeePercent', 'fx.settings.cardFee', 'fx.settings.cardFeeHint'],
                    ['taxFreePercent', 'fx.settings.taxFree', 'fx.settings.taxFreeHint'],
                    ['serviceFeePercent', 'fx.settings.serviceFee', 'fx.settings.serviceFeeHint'],
                    ['addTaxPercent', 'fx.settings.addTax', 'fx.settings.addTaxHint'],
                    ['tipPercent', 'fx.settings.tip', 'fx.settings.tipHint'],
                  ].map(([field, label, hint], i, all) => (
                    <div key={`${field}:${settings[field]}`} style={i === all.length - 1 ? { marginBottom: -1 } : undefined}>
                      <NumberRow field={field} label={t(label)} hint={t(hint)} value={settings[field]} suffix="%" onSave={save} />
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 13, color: 'var(--cs-text-sub)', paddingLeft: 4 }}>{t('fx.settings.customShortcuts')}</div>
                <div style={{ ...card, overflow: 'hidden' }}>
                  {settings.customShortcuts.map((c) => (
                    <ShortcutRow
                      key={`${c.id}:${c.name}:${c.percent}:${c.kind}`} item={c}
                      onChange={(next) => saveShortcuts(settings.customShortcuts.map((x) => (x.id === next.id ? next : x)))}
                      onRemove={() => saveShortcuts(settings.customShortcuts.filter((x) => x.id !== c.id))}
                    />
                  ))}
                  <NewShortcut
                    disabled={settings.customShortcuts.length >= MAX_SHORTCUTS}
                    onAdd={(value) => saveShortcuts([...settings.customShortcuts, { id: Math.random().toString(36).slice(2, 10), ...value }])}
                  />
                </div>
                <div style={hintStyle}>{t('fx.settings.customShortcutsHint', { max: MAX_SHORTCUTS })}</div>
              </>
            )}
            {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}
            <button onClick={reset} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: 'pointer' }}>{t('fx.settings.reset')}</button>
            <div style={hintStyle}>{t('fx.settings.resetHint')}</div>
          </>
        )}
      </div>
    </div>
  )
}

export default FxSettingsPage
