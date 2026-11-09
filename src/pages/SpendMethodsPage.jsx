// /spend-methods — 我的付款方式清單：新增、修改、刪除記帳時可選的項目，每項歸屬一個固定大類（現金、信用卡…），統計只看大類。
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { Pencil, Trash2 } from 'lucide-react'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import useSpendMethods from '../hooks/useSpendMethods'
import { SPEND_TYPES, DEFAULT_LIST_TYPE, normalizeSpendType, spendTypeLabel } from '../utils/spendMethods'

const NAME_MAX = 20
const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }
const input = { width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)', boxSizing: 'border-box' }
const iconBtn = { background: 'none', border: 'none', padding: 6, cursor: 'pointer', display: 'flex' }

const SpendMethodsPage = () => {
  const { user } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const methods = useSpendMethods(user.uid)
  const [form, setForm] = useState(null) // null 表示表單收起；{ id?, name }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const colRef = collection(db, 'users', user.uid, 'spendMethods')

  const handleSave = async () => {
    const name = form.name.trim()
    if (!name) return setError(t('spend.err.name'))
    if (methods.some(m => m.name === name && m.id !== form.id)) return setError(t('spend.err.duplicate'))
    setSaving(true)
    try {
      if (form.id) await updateDoc(doc(colRef, form.id), { name, type: form.type })
      else await addDoc(colRef, { name, type: form.type, createdAt: serverTimestamp() })
      setForm(null)
    } catch (err) {
      console.error('Failed to save spend method', err)
      setError(t('spend.saveFailed'))
    }
    setSaving(false)
  }

  const handleDelete = async (m) => {
    if (!confirm(t('spend.confirmDelete', { name: m.name }))) return
    try {
      await deleteDoc(doc(colRef, m.id))
    } catch (err) {
      console.error('Failed to delete spend method', err)
      alert(t('spend.deleteFailed'))
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 40 }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/')} aria-label={t('spend.back')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('spend.title')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--cs-text-sub)' }}>{t('spend.hint')}</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-text)' }}>{t('spend.mine')}</div>
          <button onClick={() => { setForm({ name: '', type: DEFAULT_LIST_TYPE }); setError('') }} style={{ background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{t('spend.add')}</button>
        </div>

        {methods === null && <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>}

        {methods?.map(m => (
          <div key={m.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
              <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', marginTop: 2 }}>{spendTypeLabel(m.type, t)}</div>
            </div>
            <button onClick={() => { setForm({ id: m.id, name: m.name, type: normalizeSpendType(m.type) }); setError('') }} aria-label={t('common.edit')} style={iconBtn}><Pencil size={18} color="var(--cs-text-sub)" /></button>
            <button onClick={() => handleDelete(m)} aria-label={t('common.delete')} style={iconBtn}><Trash2 size={18} color="var(--cs-danger)" /></button>
          </div>
        ))}

        {form && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ ...card, width: '100%', maxWidth: 360, padding: 20, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cs-text)' }}>{form.id ? t('spend.editTitle') : t('spend.addTitle')}</div>
              <input type="text" maxLength={NAME_MAX} value={form.name} autoFocus onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setError('') }} placeholder={t('spend.namePlaceholder')} style={input} />
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={input}>
                {SPEND_TYPES.map(c => <option key={c} value={c}>{spendTypeLabel(c, t)}</option>)}
              </select>
              {error && <div style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setForm(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 6, border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-text-sub)', fontSize: 14, cursor: 'pointer' }}>{t('common.cancel')}</button>
                <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '11px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? t('common.saving') : t('common.save')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SpendMethodsPage
