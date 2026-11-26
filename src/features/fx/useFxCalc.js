// 計算機與「幣別」頁共用的狀態（已登入、在 LedgerProvider 底下用）：目前旅程（存本機）、帳號層級的換算列與計算機設定。
// 換算列存在 users/{uid}/settings/fx 的 rows，是整個帳號一份（不跟旅程或帳本走），所以換旅程或換帳本都不會變。
import { useMemo, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from '../ledger/LedgerContext'
import { readCurrentTripId } from './fxLocalPrefs'
import { saveFxSettings } from './data'
import { useFxSettings } from './hooks'

export const useFxCalc = () => {
  const { uid, ledger, trips, tripsReady, showToast } = useLedger()
  const { t } = useI18n()
  const { settings, ready } = useFxSettings(uid)
  // 封存與垃圾桶中的旅程不能選
  const pickable = useMemo(() => trips.filter((x) => !x.deletedAt && !x.archived), [trips])
  // 目前旅程在「管理旅程」頁選，回到這裡時重新讀（頁面是重新掛載的）
  const [currentId] = useState(() => readCurrentTripId(localStorage, uid, ledger.id))
  const current = pickable.find((x) => x.id === currentId) ?? null

  const saveRows = (rows) => {
    saveFxSettings(uid, { rows }).catch((e) => { console.error('Failed to save calculator rows', e); showToast(t('fx.trip.failed')) })
  }

  return { uid, ledger, base: ledger.baseCurrency, tripsReady, ready, settings, current, rows: settings.rows, saveRows }
}
