// /fx/trash — 旅程垃圾桶：還原、永久刪除。垃圾桶中的旅程不出現在記帳月曆與統計，但它的帳目仍計入帳戶餘額，
// 永久刪除（連同帳目）時才把餘額退回。滿 30 天會在開啟匯率頁時自動永久刪除（TrashAutoPurge）。
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from '../ledger/LedgerContext'
import { shortDate, toDateStr } from '../ledger/dates'
import { useTripTxCounts } from './hooks'
import { restoreTrip, purgeTrip, loadTripTxs } from './data'
import { TRASH_DAYS, trashedTrips, trashInfo, planTripPurge } from './trash'

const btn = { padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', background: 'transparent' }

const TripTrashPage = () => {
  const { uid, ledger, accounts, trips, tripsReady, showToast } = useLedger()
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const list = useMemo(() => trashedTrips(trips), [trips])
  const counts = useTripTxCounts(uid, ledger.id, useMemo(() => list.map((x) => x.id), [list]))
  const [busyId, setBusyId] = useState(null)
  const [now] = useState(() => Date.now()) // 剩餘天數以進入頁面時為準，不在每次渲染重算

  const restore = async (trip) => {
    setBusyId(trip.id)
    try {
      await restoreTrip(uid, ledger.id, trip.id)
    } catch (e) {
      console.error('Failed to restore trip', e)
      showToast(t('fx.trash.failed'))
    }
    setBusyId(null)
  }

  // 永久刪除：先讀帳目預覽「幾筆、各帳戶退回多少」，確認後才動手
  const purge = async (trip) => {
    setBusyId(trip.id)
    try {
      const plan = planTripPurge(await loadTripTxs(uid, ledger.id, trip.id))
      const lines = Object.entries(plan.deltas).map(([id, delta]) => {
        const account = accounts.find((a) => a.id === id)
        return `${account?.name ?? id}: ${delta > 0 ? '+' : '−'}${fmt.money(Math.abs(delta), account?.currency ?? ledger.baseCurrency)}`
      })
      const message = plan.count === 0
        ? t('fx.trash.purgeConfirmNone', { name: trip.name })
        : t('fx.trash.purgeConfirm', { name: trip.name, n: plan.count, lines: lines.join('\n') || t('fx.trash.noRefund') })
      if (!window.confirm(message)) return setBusyId(null)
      const r = await purgeTrip(uid, ledger.id, trip.id)
      // 成功、或剛好被還原（旅程會回到列表）都不提示；其他原因才是失敗
      if (!r.finished && r.reason !== 'restored') showToast(t('fx.trash.failed'))
    } catch (e) {
      console.error('Failed to purge trip', e)
      showToast(t('fx.trash.failed'))
    }
    setBusyId(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', color: 'var(--cs-rc-head-text)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/fx/trips')} aria-label={t('fx.trips.title')} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 26, lineHeight: 1, padding: 0, cursor: 'pointer', flexShrink: 0 }}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{t('fx.trash.title')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!tripsReady && <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>}
        {tripsReady && list.length === 0 && <div style={{ textAlign: 'center', padding: '32px 8px', color: 'var(--cs-text-sub)', fontSize: 14, lineHeight: 1.7 }}>{t('fx.trash.empty', { days: TRASH_DAYS })}</div>}
        {list.map((trip) => {
          const info = trashInfo(trip, now)
          const count = counts[trip.id]
          const busy = busyId === trip.id
          return (
            <div key={trip.id} style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.name}</div>
              <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', marginTop: 4, lineHeight: 1.6 }}>
                {[
                  trip.currency,
                  count != null ? t('fx.trash.count', { n: count }) : null,
                  t('fx.trash.deletedOn', { date: shortDate(toDateStr(new Date(info.deletedMs))) }),
                  info.daysLeft > 0 ? t('fx.trash.daysLeft', { n: info.daysLeft }) : t('fx.trash.expiring'),
                ].filter(Boolean).join(' · ')}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button onClick={() => restore(trip)} disabled={busy} style={{ ...btn, flex: 1, border: '1px solid var(--cs-border)', color: 'var(--cs-text)' }}>{busy ? t('common.processing') : t('fx.trash.restore')}</button>
                <button onClick={() => purge(trip)} disabled={busy} style={{ ...btn, flex: 1, border: '1px solid var(--cs-danger)', color: 'var(--cs-danger)' }}>{t('fx.trash.purge')}</button>
              </div>
            </div>
          )
        })}
        <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.7 }}>{t('fx.trash.hint', { days: TRASH_DAYS })}</div>
      </div>
    </div>
  )
}

export default TripTrashPage
