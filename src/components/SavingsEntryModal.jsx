import { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { todayStr } from '../utils/expenseHelpers'
import { isValidAmount } from '../utils/savings'

const input = { width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)', boxSizing: 'border-box' }
const label = { fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 6 }

// 新增或編輯一筆存提款紀錄。entry 為既有紀錄（編輯）或 null（新增）；onSubmit、onDelete 由呼叫端寫入 Firestore，失敗時要 throw。
// 只有編輯模式且有 onDelete 時才顯示刪除鈕
const SavingsEntryModal = ({ entry, onClose, onSubmit, onDelete }) => {
  const { t } = useI18n()
  const [type, setType] = useState(entry?.type ?? 'save')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [date, setDate] = useState(entry?.date ?? todayStr())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    const n = Number(amount)
    if (!isValidAmount(n)) return setError(t('savings.err.amount'))
    setSaving(true)
    try {
      await onSubmit({ type, amount: n, title: title.trim(), date })
      onClose()
    } catch (err) {
      console.error('Failed to save savings entry', err)
      setError(t('savings.saveFailed'))
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(t('savings.confirmDeleteEntry'))) return
    setSaving(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      console.error('Failed to delete savings entry', err)
      setError(t('savings.deleteFailed'))
      setSaving(false)
    }
  }

  const typeBtn = (value, text) => (
    <button type="button" onClick={() => setType(value)} style={{ flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, background: type === value ? 'var(--cs-rc-stamp)' : 'transparent', color: type === value ? '#fff' : 'var(--cs-text)' }}>{text}</button>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--cs-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cs-card)', borderRadius: 16, padding: 16, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--cs-text)' }}>{entry ? t('savings.editEntry') : t('savings.addEntry')}</div>
        <div>
          <div style={label}>{t('savings.entry.type')}</div>
          <div style={{ display: 'flex', border: '0.5px solid var(--cs-border)', borderRadius: 10, overflow: 'hidden' }}>
            {typeBtn('save', t('savings.save'))}
            {typeBtn('withdraw', t('savings.withdraw'))}
          </div>
        </div>
        <div>
          <div style={label}>{t('savings.entry.amount')}</div>
          <input type="number" inputMode="decimal" min="0" value={amount} onChange={e => { setAmount(e.target.value); setError('') }} style={input} />
        </div>
        <div>
          <div style={label}>{t('savings.entry.title')}</div>
          <input type="text" maxLength={100} value={title} onChange={e => setTitle(e.target.value)} style={input} />
        </div>
        <div>
          <div style={label}>{t('savings.entry.date')}</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
        </div>
        {error && <div style={{ fontSize: 13, color: 'var(--cs-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '0.5px solid var(--cs-border)', background: 'var(--cs-bg)', color: 'var(--cs-text)', fontSize: 14, cursor: 'pointer' }}>{t('common.cancel')}</button>
          <button onClick={handleSubmit} disabled={saving || !date} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: saving || !date ? 0.6 : 1 }}>{t('common.save')}</button>
        </div>
        {entry && onDelete && (
          <button onClick={handleDelete} disabled={saving} style={{ background: 'none', border: 'none', color: 'var(--cs-danger)', fontSize: 14, cursor: 'pointer', padding: 4, opacity: saving ? 0.6 : 1 }}>{t('common.delete')}</button>
        )}
      </div>
    </div>
  )
}

export default SavingsEntryModal
