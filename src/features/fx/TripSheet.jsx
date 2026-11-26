// 新增／編輯旅程的底部面板：名稱、旅遊幣別、出發與回程日（選填）、是否計入個人統計；編輯時可封存。
// 「刪除旅程」只是移到垃圾桶（見 trash.js），30 天內可以還原。
import { useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import CurrencySelect from '../../components/CurrencySelect'
import { PINNED_CURRENCIES } from '../../config/currencies'
import { useLedger } from '../ledger/LedgerContext'
import { buildTripData, TRIP_NAME_MAX } from './trips'
import { createTrip, updateTrip, setTripArchived, trashTrip } from './data'
import { TRASH_DAYS } from './trash'

const inputStyle = { display: 'block', width: '100%', marginTop: 6, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-card)', outline: 'none', boxSizing: 'border-box' }
const labelStyle = { fontSize: 12, color: 'var(--cs-text-sub)' }
const hintStyle = { fontSize: 11.5, color: 'var(--cs-text-mute)', marginTop: 6, lineHeight: 1.5 }

// 預設旅遊幣別：日圓；帳本統計幣別本身就是日圓時改美元
const defaultCurrency = (base) => (base === 'JPY' ? 'USD' : 'JPY')

// trip：編輯時傳旅程文件；新增不傳。onClose(newTripId?)：新增成功時帶回新旅程 id。onTrashed：旅程移到垃圾桶後呼叫（明細頁用來離開這一頁）
const TripSheet = ({ trip, onClose, onTrashed }) => {
  const { uid, ledger, showToast } = useLedger()
  const { t } = useI18n()
  const editing = !!trip
  const [name, setName] = useState(trip?.name ?? '')
  const [currency, setCurrency] = useState(trip?.currency ?? defaultCurrency(ledger.baseCurrency))
  const [startDate, setStartDate] = useState(trip?.startDate ?? '')
  const [endDate, setEndDate] = useState(trip?.endDate ?? '')
  const [countInStats, setCountInStats] = useState(!!trip?.countInStats)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    const built = buildTripData({ name, currency, startDate, endDate, countInStats })
    if (!built.ok) return setError(t(`fx.trip.err.${built.reason}`))
    setBusy(true)
    setError('')
    try {
      if (editing) {
        await updateTrip(uid, ledger.id, trip.id, built.data)
        showToast(t('fx.trip.saved'))
        onClose()
      } else {
        const id = await createTrip(uid, ledger.id, built.data)
        showToast(t('fx.trip.created'))
        onClose(id)
      }
    } catch (e) {
      console.error('Failed to save trip', e)
      setError(t('fx.trip.failed'))
      setBusy(false)
    }
  }

  const toggleArchive = async () => {
    setBusy(true)
    setError('')
    try {
      await setTripArchived(uid, ledger.id, trip.id, !trip.archived)
      showToast(t(trip.archived ? 'fx.trip.unarchived' : 'fx.trip.archivedDone'))
      onClose()
    } catch (e) {
      console.error('Failed to archive trip', e)
      setError(t('fx.trip.failed'))
      setBusy(false)
    }
  }

  const moveToTrash = async () => {
    if (!window.confirm(t('fx.trip.deleteConfirm', { name: trip.name, days: TRASH_DAYS }))) return
    setBusy(true)
    setError('')
    try {
      await trashTrip(uid, ledger.id, trip.id)
      showToast(t('fx.trip.trashed'))
      onTrashed?.()
      onClose()
    } catch (e) {
      console.error('Failed to move trip to trash', e)
      setError(t('fx.trip.failed'))
      setBusy(false)
    }
  }

  const title = t(editing ? 'fx.trip.edit' : 'fx.trip.new')
  return (
    <>
      <div onClick={() => onClose()} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--cs-overlay)' }} />
      <div
        role="dialog" aria-modal="true" aria-label={title}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 480, zIndex: 201, maxHeight: '92vh', overflowY: 'auto', background: 'var(--cs-bg)', borderRadius: '16px 16px 0 0', padding: '14px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cs-text)' }}>{title}</div>
          <button onClick={() => onClose()} aria-label={t('ledger.entry.close')} style={{ background: 'none', border: 'none', color: 'var(--cs-text-sub)', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={20} /></button>
        </div>

        <label style={labelStyle}>
          {t('fx.trip.name')}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={TRIP_NAME_MAX} placeholder={t('fx.trip.namePlaceholder')} autoFocus={!editing} style={inputStyle} />
        </label>

        <div>
          <div style={labelStyle}>{t('fx.trip.currency')}</div>
          <div style={{ marginTop: 6 }}><CurrencySelect value={currency} onChange={setCurrency} exclude={[ledger.baseCurrency]} pinned={PINNED_CURRENCIES} /></div>
          <div style={hintStyle}>{t('fx.trip.currencyHint')}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={labelStyle}>
            {t('fx.trip.start')}
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            {t('fx.trip.end')}
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </label>
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, color: 'var(--cs-text)', cursor: 'pointer' }}>
            {t('fx.trip.countInStats')}
            <input type="checkbox" role="switch" checked={countInStats} onChange={(e) => setCountInStats(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--cs-rc-stamp)', flexShrink: 0 }} />
          </label>
          <div style={hintStyle}>{t('fx.trip.countInStatsHint')}</div>
        </div>

        {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}

        <button onClick={save} disabled={busy} style={{ width: '100%', padding: '11px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? t('common.processing') : t('common.save')}
        </button>

        {editing && (
          <>
            <button onClick={toggleArchive} disabled={busy} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {t(trip.archived ? 'fx.trip.unarchive' : 'fx.trip.archive')}
            </button>
            <div style={{ ...hintStyle, marginTop: -6 }}>{t('fx.trip.archiveHint')}</div>
            <button onClick={moveToTrash} disabled={busy} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-danger)', background: 'transparent', color: 'var(--cs-danger)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}>{t('fx.trip.delete')}</button>
            <div style={{ ...hintStyle, marginTop: -6 }}>{t('fx.trip.deleteHint', { days: TRASH_DAYS })}</div>
          </>
        )}
      </div>
    </>
  )
}

export default TripSheet
