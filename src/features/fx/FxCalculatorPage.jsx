// /fx — 匯率計算機頁。外層負責資料：目前旅程（存本機）、換算列與實付幣別（有旅程存在旅程文件上，沒有存本機）、記帳（開記帳面板）。
// 訪客沒有帳本與旅程，只有純換算（FxCalculatorGuest）。
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from '../ledger/LedgerContext'
import FxCalculator from './FxCalculator'
import TripSheet from './TripSheet'
import { DEFAULT_FX_SETTINGS, defaultRows, sanitizeRows, validCode } from './fxMath'
import { useFxSettings } from './hooks'
import { readCurrentTripId, writeCurrentTripId, readLocalCalc, writeLocalCalc } from './fxLocalPrefs'
import { setTripCalc } from './data'

const FxCalculatorPage = () => {
  const { uid, ledger, trips, tripsReady, openEntry, showToast } = useLedger()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { settings, ready: settingsReady } = useFxSettings(uid)
  const base = ledger.baseCurrency
  // 封存與垃圾桶中的旅程不能選
  const pickable = useMemo(() => trips.filter((x) => !x.deletedAt && !x.archived), [trips])
  const [currentId, setCurrentId] = useState(() => readCurrentTripId(localStorage, uid, ledger.id))
  const [local, setLocal] = useState(() => readLocalCalc(localStorage, uid))
  const [creating, setCreating] = useState(false)
  const current = pickable.find((x) => x.id === currentId) ?? null

  // 預設金額只在計算機一開始帶入，所以要等設定載入完才顯示
  if (!tripsReady || !settingsReady) return <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', display: 'grid', placeItems: 'center', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>

  const rows = current ? (sanitizeRows(current.rows) ?? defaultRows(current.currency, base)) : (sanitizeRows(local.rows) ?? defaultRows(null, base))
  const payCurrency = current ? (validCode(current.payCurrency) ?? current.currency) : (validCode(local.pay) ?? rows[0])

  const pick = (id) => {
    setCurrentId(id)
    writeCurrentTripId(localStorage, uid, ledger.id, id)
  }
  // 有旅程存在旅程文件上，沒有就存本機
  const save = (patch) => {
    if (current) {
      setTripCalc(uid, ledger.id, current.id, 'rows' in patch ? { rows: patch.rows } : { payCurrency: patch.pay })
        .catch((e) => { console.error('Failed to save calculator settings', e); showToast(t('fx.trip.failed')) })
    } else {
      writeLocalCalc(localStorage, uid, patch)
      setLocal((prev) => ({ ...prev, ...patch }))
    }
  }

  return (
    <>
      <FxCalculator
        base={base} settings={settings} trips={pickable} currentTrip={current} rows={rows} payCurrency={payCurrency}
        onRowsChange={(next) => save({ rows: next })} onPayChange={(code) => save({ pay: code })}
        onPickTrip={pick} onCreateTrip={() => setCreating(true)} onManageTrips={() => navigate('/fx/trips')}
        onOpenDetail={() => navigate(`/fx/trips/${current.id}`)} onOpenSettings={() => navigate('/fx/settings')}
        canRecord onRecord={(preset) => openEntry(undefined, preset)}
      />
      {creating && <TripSheet onClose={(id) => { setCreating(false); if (id) pick(id) }} />}
    </>
  )
}

// 訪客：沒有帳本、旅程，也不能記帳；換算列與實付幣別存本機
export const FxCalculatorGuest = () => {
  const { user } = useApp()
  const [local, setLocal] = useState(() => readLocalCalc(localStorage, user.uid))
  const rows = sanitizeRows(local.rows) ?? defaultRows(null, 'TWD')
  const save = (patch) => {
    writeLocalCalc(localStorage, user.uid, patch)
    setLocal((prev) => ({ ...prev, ...patch }))
  }
  return (
    <FxCalculator
      base="TWD" settings={DEFAULT_FX_SETTINGS} trips={[]} currentTrip={null} rows={rows} payCurrency={validCode(local.pay) ?? rows[0]}
      onRowsChange={(next) => save({ rows: next })} onPayChange={(code) => save({ pay: code })}
      canRecord={false} onRecord={() => {}}
    />
  )
}

export default FxCalculatorPage
