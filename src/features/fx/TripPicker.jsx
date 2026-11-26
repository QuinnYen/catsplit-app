// 計算機頁首的旅程選單（底部面板）：選目前的旅程、不選旅程（只換算）、新增旅程、管理旅程（列表）。
import { Check, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { tripRange } from './trips'

const row = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px', background: 'none', border: 'none', borderBottom: '0.5px solid var(--cs-border)', textAlign: 'left', cursor: 'pointer', color: 'var(--cs-text)', fontSize: 15 }

// trips：可選的旅程（不含封存與垃圾桶）；currentId：目前選的（沒選是 null）
const TripPicker = ({ trips, currentId, onPick, onNew, onManage, onClose }) => {
  const { t } = useI18n()
  const item = (id, title, sub) => (
    <button key={id ?? 'none'} onClick={() => onPick(id)} aria-pressed={currentId === id} style={row}>
      <span style={{ width: 20, display: 'grid', placeItems: 'center', color: 'var(--cs-rc-stamp)' }}>{currentId === id && <Check size={18} />}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, color: 'var(--cs-text-sub)', marginTop: 2 }}>{sub}</span>}
      </span>
    </button>
  )
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--cs-overlay)' }} />
      <div
        role="dialog" aria-modal="true" aria-label={t('fx.calc.pickTrip')}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 480, zIndex: 201, maxHeight: '80vh', overflowY: 'auto', background: 'var(--cs-bg)', borderRadius: '16px 16px 0 0', padding: '14px 16px calc(env(safe-area-inset-bottom, 0px) + 12px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cs-text)' }}>{t('fx.calc.pickTrip')}</div>
          <button onClick={onClose} aria-label={t('ledger.entry.close')} style={{ background: 'none', border: 'none', color: 'var(--cs-text-sub)', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={20} /></button>
        </div>
        {item(null, t('fx.calc.noTripOption'), null)}
        {trips.map((trip) => item(trip.id, trip.name, [`${trip.currency}`, tripRange(trip)].filter(Boolean).join(' · ')))}
        <button onClick={onNew} style={{ ...row, color: 'var(--cs-rc-stamp)', fontWeight: 600 }}><span style={{ width: 20 }} />{t('fx.calc.newTrip')}</button>
        <button onClick={onManage} style={{ ...row, borderBottom: 'none', color: 'var(--cs-text-sub)' }}><span style={{ width: 20 }} />{t('fx.calc.manage')}</button>
      </div>
    </>
  )
}

export default TripPicker
