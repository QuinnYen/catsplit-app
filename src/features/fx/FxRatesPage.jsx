// /fx/settings/rates — 自訂匯率：優先於網路匯率；反向（例如 TWD→JPY）自動取倒數，一組幣別只留一筆。
// 存在 users/{uid}/settings/fx 的 customRates（整個欄位一起寫，才能真的刪掉一組）。
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from '../ledger/LedgerContext'
import { useFxSettings } from './hooks'
import { saveCustomRates } from './data'
import { listCustomRates, setCustomRate, removeCustomRate, MAX_CUSTOM_RATES } from './fxSettings'
import CustomRateSheet from './CustomRateSheet'

const formatRateValue = (rate) => rate.toLocaleString('en-US', { maximumSignificantDigits: 8, maximumFractionDigits: 10 })

const FxRatesPage = () => {
  const { user } = useApp()
  const uid = user.uid
  const { ledger } = useLedger()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { settings, ready } = useFxSettings(uid)
  const [sheet, setSheet] = useState(null) // null | { initial? }
  const [error, setError] = useState('')
  const list = listCustomRates(settings.customRates)
  const base = ledger.baseCurrency

  const persist = async (next) => {
    setError('')
    try {
      await saveCustomRates(uid, next)
      return true
    } catch (e) {
      console.error('Failed to save custom rates', e)
      setError(t('fx.settings.failed'))
      return false
    }
  }

  // 面板用：回傳錯誤原因或 null（成功就關閉）
  const onSave = async ({ from, to, rate }) => {
    const r = setCustomRate(settings.customRates, from, to, rate)
    if (!r.ok) return r.reason
    if (!(await persist(r.customRates))) return 'failed'
    setSheet(null)
    return null
  }

  const remove = async (item) => {
    if (!window.confirm(t('fx.rates.deleteConfirm', { from: item.from, to: item.to }))) return
    await persist(removeCustomRate(settings.customRates, item.key))
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', color: 'var(--cs-rc-head-text)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/fx/settings')} aria-label={t('fx.settings.title')} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 26, lineHeight: 1, padding: 0, cursor: 'pointer', flexShrink: 0 }}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{t('fx.rates.title')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!ready ? <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div> : (
          <>
            {list.length === 0
              ? <div style={{ textAlign: 'center', padding: '28px 8px', color: 'var(--cs-text-sub)', fontSize: 14, lineHeight: 1.7 }}>{t('fx.rates.empty')}</div>
              : (
                <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', overflow: 'hidden' }}>
                  {list.map((item) => (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', borderBottom: '0.5px solid var(--cs-border)' }}>
                      <button onClick={() => setSheet({ initial: item })} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: '14px', fontSize: 15, color: 'var(--cs-text)', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>
                        {t('fx.rates.row', { from: item.from, rate: formatRateValue(item.rate), to: item.to })}
                      </button>
                      <button onClick={() => remove(item)} aria-label={t('fx.rates.delete')} style={{ background: 'none', border: 'none', padding: 14, color: 'var(--cs-danger)', cursor: 'pointer', display: 'flex' }}><Trash2 size={18} /></button>
                    </div>
                  ))}
                </div>
              )}
            {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}
            <button
              onClick={() => (list.length >= MAX_CUSTOM_RATES ? setError(t('fx.rates.err.limit', { n: MAX_CUSTOM_RATES })) : setSheet({}))}
              style={{ width: '100%', padding: '11px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >{t('fx.rates.add')}</button>
            <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.7 }}>{t('fx.rates.hint')}</div>
          </>
        )}
      </div>

      {sheet && (
        <CustomRateSheet
          initial={sheet.initial} defaultFrom={base === 'JPY' ? 'USD' : 'JPY'} defaultTo={base}
          onSave={onSave} onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

export default FxRatesPage
