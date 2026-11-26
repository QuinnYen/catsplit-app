// 新增／編輯一組自訂匯率的底部面板：1 [幣別] = [匯率] [幣別]。編輯時兩個幣別唯讀，只改匯率。
// onSave({ from, to, rate }) 回傳錯誤原因（same、rate、limit、failed）或 null（成功，由呼叫端關閉面板）。
import { useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import CurrencySelect from '../../components/CurrencySelect'
import { PINNED_CURRENCIES } from '../../config/currencies'
import { MAX_CUSTOM_RATES } from './fxSettings'

const labelStyle = { fontSize: 12, color: 'var(--cs-text-sub)' }
const inputStyle = { display: 'block', width: '100%', marginTop: 6, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 16, color: 'var(--cs-text)', background: 'var(--cs-card)', outline: 'none', boxSizing: 'border-box' }

const CustomRateSheet = ({ initial, defaultFrom, defaultTo, onSave, onClose }) => {
  const { t } = useI18n()
  const editing = !!initial
  const [from, setFrom] = useState(initial?.from ?? defaultFrom)
  const [to, setTo] = useState(initial?.to ?? defaultTo)
  const [rate, setRate] = useState(initial ? String(initial.rate) : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 選到和另一邊相同的幣別就對調，不會卡在「兩個幣別不能相同」（想設反向匯率也只要選一次）
  const pickFrom = (code) => {
    if (code === to) setTo(from)
    setFrom(code)
  }
  const pickTo = (code) => {
    if (code === from) setFrom(to)
    setTo(code)
  }

  const save = async () => {
    setBusy(true)
    setError('')
    const reason = await onSave({ from, to, rate })
    if (reason) {
      setError(t(`fx.rates.err.${reason}`, { n: MAX_CUSTOM_RATES }))
      setBusy(false)
    }
  }

  const title = t(editing ? 'fx.rates.edit' : 'fx.rates.new')
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--cs-overlay)' }} />
      <div
        role="dialog" aria-modal="true" aria-label={title}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 480, zIndex: 201, maxHeight: '92vh', overflowY: 'auto', background: 'var(--cs-bg)', borderRadius: '16px 16px 0 0', padding: '14px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cs-text)' }}>{title}</div>
          <button onClick={onClose} aria-label={t('ledger.entry.close')} style={{ background: 'none', border: 'none', color: 'var(--cs-text-sub)', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          <div>
            <div style={labelStyle}>{t('fx.rates.from')}</div>
            <div style={{ marginTop: 6 }}><CurrencySelect value={from} onChange={pickFrom} compact pinned={PINNED_CURRENCIES} disabled={editing} ariaLabel={t('fx.rates.from')} style={{ fontWeight: 700, fontSize: 16 }} /></div>
          </div>
          <div>
            <div style={labelStyle}>{t('fx.rates.to')}</div>
            <div style={{ marginTop: 6 }}><CurrencySelect value={to} onChange={pickTo} compact pinned={PINNED_CURRENCIES} disabled={editing} ariaLabel={t('fx.rates.to')} style={{ fontWeight: 700, fontSize: 16 }} /></div>
          </div>
        </div>

        <label style={labelStyle}>
          {t('fx.rates.rateLabel', { from, to })}
          <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="0.00" autoFocus aria-label={t('fx.rates.rate')} style={inputStyle} />
        </label>

        {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}

        <button onClick={save} disabled={busy} style={{ width: '100%', padding: '11px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? t('common.processing') : t('common.save')}
        </button>
      </div>
    </>
  )
}

export default CustomRateSheet
