import { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { todayStr } from '../utils/expenseHelpers'

const input = { width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4', boxSizing: 'border-box' }
const label = { fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 6 }

// 新增或編輯一筆存提款紀錄。entry 為既有紀錄（編輯）或 null（新增）；onSubmit 由呼叫端寫入 Firestore，失敗時要 throw
const SavingsEntryModal = ({ entry, onClose, onSubmit }) => {
  const { t } = useI18n()
  const [type, setType] = useState(entry?.type ?? 'save')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [date, setDate] = useState(entry?.date ?? todayStr())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    const n = Number(amount)
    if (!amount.trim() || !Number.isFinite(n) || n <= 0 || n >= 1e12) return setError(t('savings.err.amount'))
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

  const typeBtn = (value, text) => (
    <button type="button" onClick={() => setType(value)} style={{ flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, background: type === value ? '#FF8C42' : 'transparent', color: type === value ? '#fff' : '#3d2b1f' }}>{text}</button>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(61,43,31,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 16, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: '#3d2b1f' }}>{entry ? t('savings.editEntry') : t('savings.addEntry')}</div>
        <div>
          <div style={label}>{t('savings.entry.type')}</div>
          <div style={{ display: 'flex', border: '0.5px solid #f0d5c0', borderRadius: 10, overflow: 'hidden' }}>
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
        {error && <div style={{ fontSize: 13, color: '#e53935' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '0.5px solid #f0d5c0', background: '#fff8f4', color: '#3d2b1f', fontSize: 14, cursor: 'pointer' }}>{t('common.cancel')}</button>
          <button onClick={handleSubmit} disabled={saving || !date} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: '#FF8C42', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: saving || !date ? 0.6 : 1 }}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  )
}

export default SavingsEntryModal
