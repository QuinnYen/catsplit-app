// /fx/trips — 管理旅程。點旅程列＝設成目前旅程並回計算機，列右側的箭頭進旅程明細。
// 底部列：匯率（回計算機）／新增旅程（中間凸起）／垃圾桶（右下角）；首頁在右上角。
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plane, Check, ChevronRight, Trash2, ArrowLeftRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import FeatureTabBar from '../../components/FeatureTabBar'
import UserHeader from '../../components/UserHeader'
import { useLedger } from '../ledger/LedgerContext'
import FxHomeButton from './FxHomeButton'
import TripSheet from './TripSheet'
import { liveTrips, tripHome } from './trips'
import { readCurrentTripId, writeCurrentTripId } from './fxLocalPrefs'

const card = { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'none', border: 'none', padding: 14, cursor: 'pointer' }
const rowBox = (on) => ({ display: 'flex', alignItems: 'stretch', background: 'var(--cs-card)', borderRadius: 6, border: `${on ? 1.5 : 0.5}px solid ${on ? 'var(--cs-rc-stamp)' : 'var(--cs-border)'}` })
const iconCircle = { width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--cs-soft)', color: 'var(--cs-text-sub)', flexShrink: 0 }

// 一列旅程：點列設成目前旅程，右側箭頭進明細
const TripRow = ({ trip, base, current, onPick, onDetail }) => {
  const { t } = useI18n()
  return (
    <div style={rowBox(current)}>
      <button onClick={onPick} aria-pressed={current} style={card}>
        <span aria-hidden="true" style={iconCircle}><Plane size={18} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.name}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--cs-text-sub)', marginTop: 2 }}>
            {[`${trip.currency} → ${tripHome(trip, base)}`, trip.countInStats ? t('fx.trip.statsBadge') : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        {current && <Check size={18} color="var(--cs-rc-stamp)" aria-label={t('fx.trips.current')} style={{ flexShrink: 0 }} />}
      </button>
      <button onClick={onDetail} aria-label={t('fx.calc.detail')} style={{ background: 'none', border: 'none', borderLeft: '0.5px solid var(--cs-border)', padding: '0 12px', color: 'var(--cs-text-sub)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        <ChevronRight size={20} />
      </button>
    </div>
  )
}

const TripListPage = () => {
  const { uid, ledger, trips, tripsReady } = useLedger()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(false)
  const list = liveTrips(trips)
  const currentId = readCurrentTripId(localStorage, uid, ledger.id)
  const detail = (id) => navigate(`/fx/trips/${id}`)
  // 設成目前旅程（null＝不選旅程，只換算）後回計算機
  const pick = (id) => {
    writeCurrentTripId(localStorage, uid, ledger.id, id)
    navigate('/fx')
  }
  const noneOn = !list.some((x) => x.id === currentId)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <UserHeader right={<FxHomeButton />} />
      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => navigate('/fx')} aria-label={t('tab.fx')} style={{ background: 'none', border: 'none', color: 'var(--cs-text)', fontSize: 26, lineHeight: 1, padding: 0, cursor: 'pointer' }}>‹</button>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--cs-text)' }}>{t('fx.trips.title')}</div>
        </div>
        {!tripsReady && <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>}
        {tripsReady && (
          <div style={rowBox(noneOn)}>
            <button onClick={() => pick(null)} aria-pressed={noneOn} style={card}>
              <span aria-hidden="true" style={iconCircle}><Plane size={18} /></span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: 'var(--cs-text)' }}>{t('fx.calc.noTripOption')}</span>
              {noneOn && <Check size={18} color="var(--cs-rc-stamp)" aria-label={t('fx.trips.current')} style={{ flexShrink: 0 }} />}
            </button>
          </div>
        )}
        {tripsReady && list.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--cs-text-sub)', fontSize: 14, lineHeight: 1.7 }}>{t('fx.trips.empty')}</div>
        )}
        {list.map((trip) => <TripRow key={trip.id} trip={trip} base={ledger.baseCurrency} current={trip.id === currentId} onPick={() => pick(trip.id)} onDetail={() => detail(trip.id)} />)}
      </div>
      <FeatureTabBar start={{ Icon: ArrowLeftRight, label: 'tab.fx', onClick: () => navigate('/fx') }} action={{ label: 'fx.tab.addTrip', onClick: () => setSheet(true) }} end={{ Icon: Trash2, label: 'fx.tab.trash', onClick: () => navigate('/fx/trash') }} />
      {sheet && <TripSheet onClose={(id) => { setSheet(false); if (id) pick(id) }} />}
    </div>
  )
}

export default TripListPage
