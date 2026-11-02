// /savings/:goalId — 儲蓄頁：已存金額、進度條、目標日期，可新增紀錄；紀錄清單在明細頁。
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, doc, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { Pencil, Trash2 } from 'lucide-react'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import { getCurrency } from '../config/currencies'
import PawDecor from '../components/PawDecor'
import SavingsEntryModal from '../components/SavingsEntryModal'
import useSavingsEntries from '../hooks/useSavingsEntries'
import { ProgressBar } from './SavingsListPage'
import { sumSaved, progressRatio, progressPercent, daysLeft } from '../utils/savings'
import { deleteSavingsGoal } from '../utils/savingsData'
import { todayStr } from '../utils/expenseHelpers'

const card = { background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 16 }
const iconBtn = { background: 'none', border: 'none', padding: 6, cursor: 'pointer', display: 'flex' }

const SavingsGoalPage = () => {
  const { user } = useApp()
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const { goalId } = useParams()
  const [goal, setGoal] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const entries = useSavingsEntries(user.uid, goalId)

  useEffect(() => {
    return onSnapshot(doc(db, 'users', user.uid, 'savingsGoals', goalId), snap => {
      if (snap.exists()) setGoal({ id: snap.id, ...snap.data() })
      else navigate('/savings', { replace: true })
    }, err => {
      console.error('Failed to load savings goal', err)
      navigate('/savings', { replace: true })
    })
  }, [user.uid, goalId, navigate])

  const addEntry = (data) =>
    addDoc(collection(db, 'users', user.uid, 'savingsGoals', goalId, 'entries'), { ...data, createdAt: serverTimestamp() })

  const handleDelete = async () => {
    if (!confirm(t('savings.confirmDeleteGoal', { name: goal.title }))) return
    try {
      await deleteSavingsGoal(user.uid, goalId)
      navigate('/savings', { replace: true })
    } catch (err) {
      console.error('Failed to delete savings goal', err)
      alert(t('savings.deleteFailed'))
    }
  }

  const saved = sumSaved(entries ?? [])
  const ratio = goal ? progressRatio(saved, goal.targetAmount) : 0
  const left = goal ? daysLeft(goal.targetDate, todayStr()) : null
  const symbol = goal ? getCurrency(goal.currency).symbol : ''
  const dateText = left === null ? t('savings.noDate') : left > 0 ? t('savings.daysLeft', { n: left }) : left === 0 ? t('savings.dueToday') : t('savings.overdue')

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 40 }}>
      <div className="cs-header" style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <PawDecor />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/savings')} aria-label={t('savings.back')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
          <div style={{ flex: 1, minWidth: 0, color: '#fff', fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal?.title ?? t('savings.title')}</div>
          {goal && <>
            <button onClick={() => navigate(`/savings/${goalId}/edit`)} aria-label={t('common.edit')} style={iconBtn}><Pencil size={18} color="#fff" /></button>
            <button onClick={handleDelete} aria-label={t('common.delete')} style={iconBtn}><Trash2 size={18} color="#fff" /></button>
          </>}
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(!goal || entries === null) ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#b08060' }}>{t('common.loading')}</div> : (
          <>
            <div style={card}>
              <div style={{ fontSize: 12, color: '#b08060', marginBottom: 4 }}>{t('savings.saved')}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#FF6B1A', marginBottom: 12 }}>{symbol} {fmt.num(saved)}</div>
              <ProgressBar ratio={ratio} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#b08060', marginTop: 8 }}>
                <span>{saved >= goal.targetAmount ? t('savings.achieved') : t('savings.progress', { pct: progressPercent(saved, goal.targetAmount) })}</span>
                <span>{symbol} {fmt.num(goal.targetAmount)}</span>
              </div>
              <div style={{ fontSize: 13, color: '#3d2b1f', marginTop: 12 }}>
                {goal.targetDate ? `${fmt.date(`${goal.targetDate}T00:00`)}・` : ''}{dateText}
              </div>
            </div>
            <button onClick={() => setShowModal(true)} style={{ padding: '13px 0', borderRadius: 14, border: 'none', background: '#FF8C42', color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>{t('savings.addEntry')}</button>
            <button onClick={() => navigate(`/savings/${goalId}/entries`)} style={{ padding: '13px 0', borderRadius: 14, border: '0.5px solid #f0d5c0', background: '#fff', color: '#3d2b1f', fontSize: 15, cursor: 'pointer' }}>{t('savings.entries')}</button>
          </>
        )}
      </div>

      {showModal && <SavingsEntryModal entry={null} onClose={() => setShowModal(false)} onSubmit={addEntry} />}
    </div>
  )
}

export default SavingsGoalPage
