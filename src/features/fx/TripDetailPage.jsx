// /fx/trips/:tripId — 旅程明細：總花費卡、依日期分組的帳目列表、底部「記帳」開啟記帳面板（帶入這趟旅程）。
// 帳目就是個人記帳的一般帳目（只是帶 tripId），點一筆開同一個面板編輯。
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Pencil, ArrowLeftRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import FeatureTabBar from '../../components/FeatureTabBar'
import UserHeader from '../../components/UserHeader'
import { useLedger } from '../ledger/LedgerContext'
import { entryHeadline } from '../ledger/entryDraft'
import { shortDate, todayStr, weekdayOf } from '../ledger/dates'
import { useTripTransactions } from './hooks'
import { tripTotals, groupByDate } from './tripSummary'
import FxHomeButton from './FxHomeButton'
import TripSheet from './TripSheet'

const TripDetailPage = () => {
  const { tripId } = useParams()
  const { uid, ledger, accounts, trips, tripsReady, catName, openEntry } = useLedger()
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const trip = trips.find((x) => x.id === tripId && !x.deletedAt)
  const txs = useTripTransactions(uid, ledger.id, trip ? tripId : null)
  const base = ledger.baseCurrency
  const totals = useMemo(() => (trip && txs ? tripTotals(txs, trip) : null), [trip, txs])
  const groups = useMemo(() => (txs ? groupByDate(txs) : []), [txs])
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const back = <button onClick={() => navigate('/fx/trips')} aria-label={t('fx.trip.back')} style={{ background: 'none', border: 'none', color: 'var(--cs-text)', fontSize: 26, lineHeight: 1, padding: 0, cursor: 'pointer', flexShrink: 0 }}>‹</button>

  if (!tripsReady || !trip) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
        <UserHeader right={<FxHomeButton />} />
        <div className="cs-body" style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 6 }}>{back}<div style={{ fontSize: 17, fontWeight: 600, color: 'var(--cs-text)' }}>{t('fx.trips.title')}</div></div>
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--cs-text-sub)', fontSize: 14 }}>{t(tripsReady ? 'fx.trip.notFound' : 'common.loading')}</div>
        <FeatureTabBar start={{ Icon: ArrowLeftRight, label: 'tab.fx', onClick: () => navigate('/fx') }} />
      </div>
    )
  }

  const renderRow = (tx) => {
    const account = accountById.get(tx.accountId)
    const transfer = tx.type === 'transfer'
    const label = transfer ? t('ledger.kind.transfer') : catName(tx.type, tx.category)
    const headline = transfer ? (tx.note || label) : entryHeadline(tx, () => label)
    const sub = [
      account?.name,
      !transfer && (tx.title || tx.note) ? label : null,
      !transfer && tx.currency !== base ? `≈ ${fmt.money(tx.baseAmount, base)}` : null,
    ].filter(Boolean).join(' · ')
    const tone = tx.type === 'income' ? 'var(--cs-rc-get)' : transfer ? 'var(--cs-text-sub)' : 'var(--cs-rc-owe)'
    const amountText = `${transfer ? '' : tx.type === 'income' ? '+' : '−'}${fmt.money(tx.amount, tx.currency)}`
    return (
      <button
        key={tx.id} onClick={() => openEntry(tx)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', borderBottom: '0.5px solid var(--cs-border)', textAlign: 'left', cursor: 'pointer' }}
      >
        <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0, background: 'var(--cs-soft)', color: tone }}>{label.charAt(0)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headline}</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-sub)', marginTop: 2 }}>{sub}</span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: tone, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{amountText}</span>
      </button>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <UserHeader right={<FxHomeButton />} />

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 標題：旅程名稱與細節（和管理旅程頁的標題列同一種做法） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {back}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.name}</div>
            <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', marginTop: 2 }}>
              {trip.currency} → {base}{totals ? ` · ${t('fx.trip.count', { n: totals.count })}` : ''}
            </div>
          </div>
        </div>
        <div style={{ background: 'var(--cs-card)', border: '0.5px solid var(--cs-border)', borderRadius: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '0.5px solid var(--cs-border)' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--cs-text)' }}>{t('fx.trip.total')}</span>
            {trip.currency !== base && totals && <span style={{ fontSize: 13, color: 'var(--cs-text-sub)', fontVariantNumeric: 'tabular-nums' }}>{fmt.money(totals.own, trip.currency)}</span>}
          </div>
          <div style={{ padding: '14px 14px 16px', fontFamily: 'var(--cs-rc-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 32, fontWeight: 700, color: 'var(--cs-text)', textAlign: 'right' }}>
            {totals ? fmt.money(totals.base, base) : '…'}
          </div>
        </div>

        {txs === null && <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--cs-text-mute)', fontSize: 13 }}>{t('common.loading')}</div>}
        {txs?.length === 0 && <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--cs-text-sub)', fontSize: 14, lineHeight: 1.7 }}>{t('fx.trip.empty')}</div>}
        {groups.map((g) => (
          <div key={g.date} style={{ background: 'var(--cs-rc-card)', border: '0.5px solid var(--cs-border)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '10px 16px 8px', borderBottom: '1.5px dashed var(--cs-rc-rule)' }}>
              <b style={{ fontSize: 14, color: 'var(--cs-text)' }}>{t('ledger.day.header', { date: shortDate(g.date), weekday: t(`date.weekday.${weekdayOf(g.date)}`) })}</b>
              <span style={{ fontSize: 12, color: 'var(--cs-text-sub)', fontVariantNumeric: 'tabular-nums' }}>{fmt.money(g.net, base)}</span>
            </div>
            {g.items.map(renderRow)}
          </div>
        ))}
      </div>

      <FeatureTabBar start={{ Icon: ArrowLeftRight, label: 'tab.fx', onClick: () => navigate('/fx') }} action={{ label: 'fx.trip.addEntry', onClick: () => openEntry(undefined, { tripId: trip.id, currency: trip.currency, date: todayStr() }) }} end={{ Icon: Pencil, label: 'fx.tab.edit', onClick: () => setEditing(true) }} />
      {editing && <TripSheet trip={trip} onClose={() => setEditing(false)} onTrashed={() => navigate('/fx/trips')} />}
    </div>
  )
}

export default TripDetailPage
