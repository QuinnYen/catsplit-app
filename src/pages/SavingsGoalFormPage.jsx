// /savings/new、/savings/:goalId/edit — 建立或編輯儲蓄目標；貨幣建立後不可改。
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, doc, getDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import { CURRENCIES } from '../config/currencies'
import PawDecor from '../components/PawDecor'
import { deleteSavingsGoal } from '../utils/savingsData'
import { isValidAmount } from '../utils/savings'

const input = { width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff', boxSizing: 'border-box' }
const label = { fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 6 }

const SavingsGoalFormPage = () => {
  const { user } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { goalId } = useParams()
  const editing = !!goalId
  const [loaded, setLoaded] = useState(!editing)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [currency, setCurrency] = useState(CURRENCIES[0].code)
  const [targetDate, setTargetDate] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) return
    getDoc(doc(db, 'users', user.uid, 'savingsGoals', goalId)).then(snap => {
      if (!snap.exists()) return navigate('/savings', { replace: true })
      const g = snap.data()
      setTitle(g.title); setTarget(String(g.targetAmount)); setCurrency(g.currency); setTargetDate(g.targetDate ?? '')
      setLoaded(true)
    }).catch(err => {
      console.error('Failed to load savings goal', err)
      navigate('/savings', { replace: true })
    })
  }, [editing, goalId, user.uid, navigate])

  const handleSave = async () => {
    const trimmed = title.trim()
    if (!trimmed) return setError(t('savings.err.title'))
    const n = Number(target)
    if (!isValidAmount(n)) return setError(t('savings.err.amount'))
    const data = { title: trimmed, targetAmount: n, targetDate: targetDate || null }
    setSaving(true)
    try {
      if (editing) {
        await updateDoc(doc(db, 'users', user.uid, 'savingsGoals', goalId), data)
        navigate(`/savings/${goalId}`, { replace: true })
      } else {
        const ref = await addDoc(collection(db, 'users', user.uid, 'savingsGoals'), { ...data, currency, createdAt: serverTimestamp() })
        navigate(`/savings/${ref.id}`, { replace: true })
      }
    } catch (err) {
      console.error('Failed to save savings goal', err)
      alert(t('savings.saveFailed'))
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(t('savings.confirmDeleteGoal', { name: title }))) return
    setSaving(true)
    try {
      await deleteSavingsGoal(user.uid, goalId)
      navigate('/savings', { replace: true })
    } catch (err) {
      console.error('Failed to delete savings goal', err)
      alert(t('savings.deleteFailed'))
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 40 }}>
      <div className="cs-header" style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <PawDecor />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate(-1)} aria-label={t('savings.back')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{editing ? t('savings.form.editTitle') : t('savings.form.newTitle')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!loaded ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#b08060' }}>{t('common.loading')}</div> : (
          <>
            <div>
              <div style={label}>{t('savings.form.title')}</div>
              <input type="text" maxLength={50} value={title} onChange={e => { setTitle(e.target.value); setError('') }} style={input} />
            </div>
            <div>
              <div style={label}>{t('savings.form.target')}</div>
              <input type="number" inputMode="decimal" min="0" value={target} onChange={e => { setTarget(e.target.value); setError('') }} style={input} />
            </div>
            <div>
              <div style={label}>{t('savings.form.currency')}</div>
              <select value={currency} onChange={e => setCurrency(e.target.value)} disabled={editing} style={input}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} {t(c.labelKey)}</option>)}
              </select>
              {editing && <div style={{ fontSize: 12, color: '#b08060', marginTop: 4 }}>{t('savings.form.currencyLocked')}</div>}
            </div>
            <div>
              <div style={label}>{t('savings.form.targetDate')}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={input} />
                {targetDate && <button type="button" onClick={() => setTargetDate('')} style={{ flexShrink: 0, background: 'none', border: 'none', color: '#b08060', fontSize: 13, cursor: 'pointer' }}>{t('savings.form.clearDate')}</button>}
              </div>
            </div>
            {error && <div style={{ fontSize: 13, color: '#e53935' }}>{error}</div>}
            <button onClick={handleSave} disabled={saving} style={{ padding: '13px 0', borderRadius: 14, border: 'none', background: '#FF8C42', color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{t('common.save')}</button>
            {editing && <button onClick={handleDelete} disabled={saving} style={{ padding: '13px 0', borderRadius: 14, border: '0.5px solid #f0d5c0', background: '#fff', color: '#e53935', fontSize: 15, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{t('common.delete')}</button>}
          </>
        )}
      </div>
    </div>
  )
}

export default SavingsGoalFormPage
