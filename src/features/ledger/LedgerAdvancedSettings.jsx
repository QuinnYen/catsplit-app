// 設定頁「進階」分頁：週開始日、月開始日、年開始月（帳本層級）。只影響月曆、總計、圖表與預算怎麼分期間，資料不變；選了立刻儲存。
import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from './LedgerContext'
import { updateLedgerPeriod } from './data'
import { periodSettings } from './dates'

const WEEK_STARTS = [0, 1, 6]
const MONTH_STARTS = [...Array.from({ length: 28 }, (_, i) => i + 1), 0] // 0 = 月末
const selectStyle = { width: '100%', marginTop: 6, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-bg)', outline: 'none', boxSizing: 'border-box' }

const LedgerAdvancedSettings = () => {
  const { uid, ledger, showToast } = useLedger()
  const { t } = useI18n()
  const { monthStartDay, weekStartDay, yearStartMonth } = periodSettings(ledger)
  const [busy, setBusy] = useState(false)

  const save = async (patch) => {
    setBusy(true)
    try {
      await updateLedgerPeriod(uid, ledger.id, patch)
      showToast(t('ledger.edit.saved'))
    } catch (e) {
      console.error('Failed to save ledger period settings', e)
      showToast(t('ledger.edit.failed'))
    }
    setBusy(false)
  }

  return (
    <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>
        {t('ledger.adv.weekStart')}
        <select value={weekStartDay} disabled={busy} onChange={(e) => save({ weekStartDay: Number(e.target.value) })} style={selectStyle}>
          {WEEK_STARTS.map((d) => <option key={d} value={d}>{t(`ledger.adv.week.${d}`)}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>
        {t('ledger.adv.monthStart')}
        <select value={monthStartDay} disabled={busy} onChange={(e) => save({ monthStartDay: Number(e.target.value) })} style={selectStyle}>
          {MONTH_STARTS.map((d) => <option key={d} value={d}>{d === 0 ? t('ledger.adv.monthEnd') : t('ledger.adv.day', { n: d })}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>
        {t('ledger.adv.yearStart')}
        <select value={yearStartMonth} disabled={busy} onChange={(e) => save({ yearStartMonth: Number(e.target.value) })} style={selectStyle}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{t('ledger.adv.monthN', { n: m })}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>
        {t('ledger.adv.holiday')}
        <select value={ledger.holidayAdjust ?? 'none'} disabled={busy} onChange={(e) => save({ holidayAdjust: e.target.value })} style={selectStyle}>
          {['none', 'before', 'after'].map((m) => <option key={m} value={m}>{t(`ledger.adv.holiday.${m}`)}</option>)}
        </select>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-mute)', marginTop: 4, lineHeight: 1.6 }}>{t('ledger.adv.holidayHint')}</span>
      </label>
      <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.7 }}>
        <div>{t('ledger.adv.hint')}</div>
        <div>{t('ledger.adv.example')}</div>
      </div>
    </div>
  )
}

export default LedgerAdvancedSettings
