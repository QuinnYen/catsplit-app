// /fx — 匯率計算機頁。外層負責資料：目前旅程、帳號的換算列與設定（useFxCalc）、記帳（開記帳面板）。
// 訪客沒有帳本與旅程，只有純換算（FxCalculatorGuest）。
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from '../ledger/LedgerContext'
import FxCalculator from './FxCalculator'
import { DEFAULT_FX_SETTINGS, DEFAULT_ROWS, sanitizeRows } from './fxMath'
import { useFxCalc } from './useFxCalc'
import { readLocalCalc, writeLocalCalc } from './fxLocalPrefs'

const FxCalculatorPage = () => {
  const { openEntry } = useLedger()
  const { t } = useI18n()
  const navigate = useNavigate()
  const calc = useFxCalc()

  // 預設金額只在計算機一開始帶入，所以要等設定載入完才顯示
  if (!calc.tripsReady || !calc.ready) return <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', display: 'grid', placeItems: 'center', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>

  return (
    <FxCalculator
      base={calc.base} settings={calc.settings} currentTrip={calc.current} rows={calc.rows}
      onRowsChange={calc.saveRows}
      onManageTrips={() => navigate('/fx/trips')}
      onOpenDetail={() => navigate(`/fx/trips/${calc.current.id}`)} onOpenCurrencies={() => navigate('/fx/currencies')} onOpenSettings={() => navigate('/fx/settings')}
      canRecord onRecord={(preset) => openEntry(undefined, preset)}
    />
  )
}

// 訪客：沒有帳本、旅程，也不能記帳；換算列存本機
export const FxCalculatorGuest = () => {
  const { user } = useApp()
  const navigate = useNavigate()
  const [local, setLocal] = useState(() => readLocalCalc(localStorage, user.uid))
  const rows = sanitizeRows(local.rows) ?? DEFAULT_ROWS
  const saveRows = (next) => {
    writeLocalCalc(localStorage, user.uid, { rows: next })
    setLocal((prev) => ({ ...prev, rows: next }))
  }
  return (
    <FxCalculator
      base="TWD" settings={DEFAULT_FX_SETTINGS} currentTrip={null} rows={rows}
      onRowsChange={saveRows}
      onOpenCurrencies={() => navigate('/fx/currencies')}
      canRecord={false} onRecord={() => {}}
    />
  )
}

export default FxCalculatorPage
