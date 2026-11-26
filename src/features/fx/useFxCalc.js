// 計算機與「幣別」頁共用的狀態（已登入、在 LedgerProvider 底下用）：目前旅程（存本機）、換算列與實付幣別
// （有旅程存在旅程文件上，沒有存本機）。兩個頁面讀同一份，所以在幣別頁改的換算列，回到計算機就是新的。
import { useMemo, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from '../ledger/LedgerContext'
import { defaultRows, sanitizeRows, validCode } from './fxMath'
import { readCurrentTripId, readLocalCalc, writeLocalCalc } from './fxLocalPrefs'
import { setTripCalc } from './data'

export const useFxCalc = () => {
  const { uid, ledger, trips, tripsReady, showToast } = useLedger()
  const { t } = useI18n()
  const base = ledger.baseCurrency
  // 封存與垃圾桶中的旅程不能選
  const pickable = useMemo(() => trips.filter((x) => !x.deletedAt && !x.archived), [trips])
  // 目前旅程在「管理旅程」頁選，回到這裡時重新讀（頁面是重新掛載的）
  const [currentId] = useState(() => readCurrentTripId(localStorage, uid, ledger.id))
  const [local, setLocal] = useState(() => readLocalCalc(localStorage, uid))
  const current = pickable.find((x) => x.id === currentId) ?? null

  const rows = current ? (sanitizeRows(current.rows) ?? defaultRows(current.currency, base)) : (sanitizeRows(local.rows) ?? defaultRows(null, base))
  const payCurrency = current ? (validCode(current.payCurrency) ?? current.currency) : (validCode(local.pay) ?? rows[0])

  // patch：{ rows } 或 { pay }
  const save = (patch) => {
    if (current) {
      setTripCalc(uid, ledger.id, current.id, 'rows' in patch ? { rows: patch.rows } : { payCurrency: patch.pay })
        .catch((e) => { console.error('Failed to save calculator settings', e); showToast(t('fx.trip.failed')) })
    } else {
      writeLocalCalc(localStorage, uid, patch)
      setLocal((prev) => ({ ...prev, ...patch }))
    }
  }

  return { uid, ledger, base, tripsReady, current, rows, payCurrency, save }
}
