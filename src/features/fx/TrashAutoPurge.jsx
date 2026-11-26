// 開啟匯率頁時，把在垃圾桶滿 30 天的旅程永久刪除（專案沒有後端排程，和固定收支一樣在開啟時補做）。不畫任何東西。
// 只處理目前帳本的旅程；每次最多刪 AUTO_PURGE_BUDGET 筆帳目，其餘下次開啟再處理；每趟旅程獨立處理，一趟失敗不影響其他。
import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from '../ledger/LedgerContext'
import { expiredTrips } from './trash'
import { purgeTrip } from './data'

export const AUTO_PURGE_BUDGET = 1000

const TrashAutoPurge = () => {
  const { uid, ledger, trips, tripsReady, showToast } = useLedger()
  const { t } = useI18n()
  const done = useRef(new Set()) // 每個帳本這次使用只自動處理一次
  const scope = `${uid}/${ledger.id}`

  useEffect(() => {
    if (!tripsReady || done.current.has(scope)) return
    done.current.add(scope)
    const expired = expiredTrips(trips, Date.now())
    if (expired.length === 0) return
    ;(async () => {
      let budget = AUTO_PURGE_BUDGET
      let purged = 0
      for (const trip of expired) {
        if (budget <= 0) break
        try {
          const r = await purgeTrip(uid, ledger.id, trip.id, { maxTxs: budget })
          budget -= r.deleted
          if (r.finished) purged++
        } catch (e) {
          console.error('Failed to purge expired trip', trip.id, e)
        }
      }
      if (purged > 0) showToast(t('fx.trash.autoPurged', { n: purged }))
    })()
  }, [tripsReady, scope, trips, uid, ledger.id, showToast, t])

  return null
}

export default TrashAutoPurge
