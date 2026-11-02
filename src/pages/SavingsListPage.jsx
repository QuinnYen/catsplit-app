// /savings — 儲蓄目標列表：每張卡片顯示標題、已存／目標金額與進度條，點進去看該目標的儲蓄頁。
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import { getCurrency } from '../config/currencies'
import PawDecor from '../components/PawDecor'
import useSavingsEntries from '../hooks/useSavingsEntries'
import { sumSaved, progressRatio } from '../utils/savings'

const card = { background: 'var(--cs-card)', borderRadius: 16, border: '0.5px solid var(--cs-border)', padding: 14, cursor: 'pointer', textAlign: 'left', width: '100%' }

export const ProgressBar = ({ ratio }) => (
  <div style={{ height: 8, borderRadius: 4, background: 'var(--cs-track)', overflow: 'hidden' }}>
    <div style={{ width: `${Math.round(ratio * 100)}%`, height: '100%', background: ratio >= 1 ? '#4caf50' : '#FF8C42', borderRadius: 4 }} />
  </div>
)

const GoalCard = ({ goal, uid }) => {
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const entries = useSavingsEntries(uid, goal.id)
  const saved = sumSaved(entries ?? [])
  const symbol = getCurrency(goal.currency).symbol
  return (
    <button onClick={() => navigate(`/savings/${goal.id}`)} style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.title}</div>
        {saved >= goal.targetAmount && <div style={{ fontSize: 12, color: '#4caf50', fontWeight: 500, flexShrink: 0 }}>{t('savings.achieved')}</div>}
      </div>
      <ProgressBar ratio={progressRatio(saved, goal.targetAmount)} />
      <div style={{ fontSize: 13, color: 'var(--cs-text-sub)', marginTop: 8 }}>{symbol} {fmt.num(saved)} / {fmt.num(goal.targetAmount)}</div>
    </button>
  )
}

const SavingsListPage = () => {
  const { user } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [goals, setGoals] = useState(null)

  useEffect(() => {
    return onSnapshot(collection(db, 'users', user.uid, 'savingsGoals'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity))
      setGoals(data)
    }, err => {
      console.error('Failed to load savings goals', err)
      setGoals([])
    })
  }, [user.uid])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 40 }}>
      <div className="cs-header" style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <PawDecor />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/')} aria-label={t('savings.back')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('savings.title')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => navigate('/savings/new')} style={{ background: '#FF8C42', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{t('savings.add')}</button>
        </div>
        {goals === null && <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>}
        {goals?.length === 0 && <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cs-text-sub)', fontSize: 14 }}>{t('savings.empty')}</div>}
        {goals?.map(g => <GoalCard key={g.id} goal={g} uid={user.uid} />)}
      </div>
    </div>
  )
}

export default SavingsListPage
