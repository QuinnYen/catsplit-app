// /savings/:goalId/entries — 明細：全部存提款紀錄（新到舊），可編輯、刪除。
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { Pencil, Trash2 } from 'lucide-react'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import { getCurrency } from '../config/currencies'
import PawDecor from '../components/PawDecor'
import SavingsEntryModal from '../components/SavingsEntryModal'
import useSavingsEntries from '../hooks/useSavingsEntries'
import { sumSaved } from '../utils/savings'

const card = { background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }
const iconBtn = { background: 'none', border: 'none', padding: 6, cursor: 'pointer', display: 'flex' }

const SavingsEntriesPage = () => {
  const { user } = useApp()
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const { goalId } = useParams()
  const [goal, setGoal] = useState(null)
  const [editing, setEditing] = useState(null)
  const entries = useSavingsEntries(user.uid, goalId)

  useEffect(() => {
    getDoc(doc(db, 'users', user.uid, 'savingsGoals', goalId)).then(snap => {
      if (!snap.exists()) return navigate('/savings', { replace: true })
      setGoal(snap.data())
    }).catch(err => {
      console.error('Failed to load savings goal', err)
      navigate('/savings', { replace: true })
    })
  }, [user.uid, goalId, navigate])

  // 日期新到舊；同日以建立時間新到舊（剛寫入、時間戳還沒回填的排最前）
  const sorted = useMemo(() => (entries ?? []).slice().sort((a, b) =>
    b.date.localeCompare(a.date) || (b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity)), [entries])

  const entryRef = (id) => doc(db, 'users', user.uid, 'savingsGoals', goalId, 'entries', id)
  const handleDelete = async (e) => {
    if (!confirm(t('savings.confirmDeleteEntry'))) return
    try {
      await deleteDoc(entryRef(e.id))
    } catch (err) {
      console.error('Failed to delete savings entry', err)
      alert(t('savings.deleteFailed'))
    }
  }

  const symbol = goal ? getCurrency(goal.currency).symbol : ''

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 40 }}>
      <div className="cs-header" style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <PawDecor />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate(`/savings/${goalId}`)} aria-label={t('savings.back')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{goal ? `${goal.title}・${t('savings.entries')}` : t('savings.entries')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(!goal || entries === null) && <div style={{ textAlign: 'center', padding: '32px 0', color: '#b08060' }}>{t('common.loading')}</div>}
        {goal && entries && (
          <>
            <div style={{ fontSize: 13, color: '#b08060' }}>{t('savings.saved')} {symbol} {fmt.num(sumSaved(entries))}</div>
            {sorted.length === 0 && <div style={{ textAlign: 'center', padding: '32px 0', color: '#b08060', fontSize: 14 }}>{t('savings.entries.empty')}</div>}
            {sorted.map(e => {
              const isSave = e.type === 'save'
              return (
                <div key={e.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title || t(isSave ? 'savings.save' : 'savings.withdraw')}</div>
                    <div style={{ fontSize: 12, color: '#b08060' }}>{fmt.shortDate(`${e.date}T00:00`)}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: isSave ? '#2e9e5b' : '#e53935', flexShrink: 0 }}>{isSave ? '+' : '−'}{symbol} {fmt.num(e.amount)}</div>
                  <button onClick={() => setEditing(e)} aria-label={t('common.edit')} style={iconBtn}><Pencil size={16} color="#b08060" /></button>
                  <button onClick={() => handleDelete(e)} aria-label={t('common.delete')} style={iconBtn}><Trash2 size={16} color="#b08060" /></button>
                </div>
              )
            })}
          </>
        )}
      </div>

      {editing && <SavingsEntryModal entry={editing} onClose={() => setEditing(null)} onSubmit={(data) => updateDoc(entryRef(editing.id), data)} />}
    </div>
  )
}

export default SavingsEntriesPage
