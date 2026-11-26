// /fx/trips — 旅程列表（進行中與已封存）。從計算機頁首的旅程選單「管理旅程」進來。
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plane } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import FeatureTabBar from '../../components/FeatureTabBar'
import UserHeader from '../../components/UserHeader'
import { useLedger } from '../ledger/LedgerContext'
import TripSheet from './TripSheet'
import { splitTrips, tripRange } from './trips'

const card = { width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14, cursor: 'pointer' }

const TripCard = ({ trip, base, onOpen }) => {
  const { t } = useI18n()
  const range = tripRange(trip)
  return (
    <button onClick={onOpen} style={card}>
      <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--cs-soft)', color: 'var(--cs-text-sub)', flexShrink: 0 }}><Plane size={18} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.name}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--cs-text-sub)', marginTop: 2 }}>
          {[`${trip.currency} → ${base}`, range, trip.countInStats ? t('fx.trip.statsBadge') : null].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  )
}

const TripListPage = () => {
  const { ledger, trips, tripsReady } = useLedger()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(false)
  const { active, archived } = splitTrips(trips)
  const open = (id) => navigate(`/fx/trips/${id}`)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <UserHeader />
      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => navigate('/fx')} aria-label={t('tab.fx')} style={{ background: 'none', border: 'none', color: 'var(--cs-text)', fontSize: 26, lineHeight: 1, padding: 0, cursor: 'pointer' }}>‹</button>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--cs-text)' }}>{t('fx.trips.title')}</div>
        </div>
        {!tripsReady && <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>}
        {tripsReady && active.length === 0 && archived.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 8px', color: 'var(--cs-text-sub)', fontSize: 14, lineHeight: 1.7 }}>{t('fx.trips.empty')}</div>
        )}
        {active.map((trip) => <TripCard key={trip.id} trip={trip} base={ledger.baseCurrency} onOpen={() => open(trip.id)} />)}
        {archived.length > 0 && (
          <details>
            <summary style={{ fontSize: 13, color: 'var(--cs-text-sub)', cursor: 'pointer', padding: '4px 0 10px' }}>{t('fx.trips.archived', { n: archived.length })}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {archived.map((trip) => <TripCard key={trip.id} trip={trip} base={ledger.baseCurrency} onOpen={() => open(trip.id)} />)}
            </div>
          </details>
        )}
      </div>
      <FeatureTabBar action={{ label: 'fx.tab.addTrip', onClick: () => setSheet(true) }} />
      {sheet && <TripSheet onClose={(id) => { setSheet(false); if (id) open(id) }} />}
    </div>
  )
}

export default TripListPage
