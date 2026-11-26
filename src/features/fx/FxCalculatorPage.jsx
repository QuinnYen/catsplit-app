// /fx — 匯率計算機頁。外層負責資料：目前旅程、換算列與實付幣別（useFxCalc）、記帳（開記帳面板）。
// 訪客沒有帳本與旅程，只有純換算（FxCalculatorGuest）。
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from '../ledger/LedgerContext'
import FxCalculator from './FxCalculator'
import TripSheet from './TripSheet'
import { DEFAULT_FX_SETTINGS, defaultRows, sanitizeRows, validCode } from './fxMath'
import { useFxSettings } from './hooks'
import { useFxCalc } from './useFxCalc'
import { readLocalCalc, writeLocalCalc } from './fxLocalPrefs'

const FxCalculatorPage = () => {
  const { openEntry } = useLedger()
  const { t } = useI18n()
  const navigate = useNavigate()
  const calc = useFxCalc()
  const { settings, ready: settingsReady } = useFxSettings(calc.uid)
  const [creating, setCreating] = useState(false)

  // 預設金額只在計算機一開始帶入，所以要等設定載入完才顯示
  if (!calc.tripsReady || !settingsReady) return <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', display: 'grid', placeItems: 'center', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>

  return (
    <>
      <FxCalculator
        base={calc.base} settings={settings} trips={calc.pickable} currentTrip={calc.current} rows={calc.rows} payCurrency={calc.payCurrency}
        onRowsChange={(next) => calc.save({ rows: next })} onPayChange={(code) => calc.save({ pay: code })}
        onPickTrip={calc.pick} onCreateTrip={() => setCreating(true)} onManageTrips={() => navigate('/fx/trips')}
        onOpenDetail={() => navigate(`/fx/trips/${calc.current.id}`)} onOpenCurrencies={() => navigate('/fx/currencies')} onOpenSettings={() => navigate('/fx/settings')}
        canRecord onRecord={(preset) => openEntry(undefined, preset)}
      />
      {creating && <TripSheet onClose={(id) => { setCreating(false); if (id) calc.pick(id) }} />}
    </>
  )
}

// 訪客：沒有帳本、旅程，也不能記帳；換算列與實付幣別存本機
export const FxCalculatorGuest = () => {
  const { user } = useApp()
  const navigate = useNavigate()
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
      onOpenCurrencies={() => navigate('/fx/currencies')}
      canRecord={false} onRecord={() => {}}
    />
  )
}

export default FxCalculatorPage
