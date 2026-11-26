// 群組同步來的帳目（快照）：金額、幣別、日期、標題來自群組、不能在這裡改（要改請到群組，下次同步會更新）；
// 分類與備註可以改，改過的欄位之後同步不再覆寫。
import { useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from './LedgerContext'
import { saveSnapshotEdits } from './data'
import { NOTE_MAX } from './constants'
import BackClose from '../../components/BackClose'

const inputStyle = { display: 'block', width: '100%', marginTop: 6, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-card)', outline: 'none', boxSizing: 'border-box' }
const labelStyle = { fontSize: 12, color: 'var(--cs-text-sub)' }

const SnapshotTxSheet = ({ tx, onClose }) => {
  const { uid, ledger, accounts, showToast, categories: ledgerCategories, catName } = useLedger()
  const { t, fmt } = useI18n()
  const [category, setCategory] = useState(tx.category ?? '')
  const [note, setNote] = useState(tx.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const base = ledger.baseCurrency
  const group = accounts.find((a) => a.id === tx.accountId)?.name ?? ''
  const options = (tx.type === 'income' ? ledgerCategories.income : ledgerCategories.expense).map((c) => c.key)
  const categoryOptions = !category || options.includes(category) ? options : [category, ...options]

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await saveSnapshotEdits(uid, ledger.id, tx, { category, note: note.trim() })
      showToast(t('ledger.entry.saved'))
      onClose()
    } catch (e) {
      console.error('Failed to save snapshot edits', e)
      setError(t('ledger.entry.saveFailed'))
      setBusy(false)
    }
  }

  const row = (name, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '6px 0' }}>
      <span style={{ color: 'var(--cs-text-sub)' }}>{name}</span>
      <span style={{ color: 'var(--cs-text)', textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  )

  return (
    <>
      <BackClose onClose={onClose} />
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--cs-overlay)' }} />
      <div
        role="dialog" aria-modal="true" aria-label={t('ledger.snapshot.title')}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 480, zIndex: 201, maxHeight: '92vh', overflowY: 'auto', background: 'var(--cs-bg)', borderRadius: '16px 16px 0 0', padding: '14px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cs-text)' }}>{t('ledger.snapshot.title')}</div>
          <button onClick={onClose} aria-label={t('ledger.entry.close')} style={{ background: 'none', border: 'none', color: 'var(--cs-text-sub)', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ background: 'var(--cs-card)', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '6px 14px' }}>
          {row(t('ledger.snapshot.group'), group)}
          {row(t('ledger.entry.date'), tx.date)}
          {tx.title && row(t('ledger.snapshot.itemTitle'), tx.title)}
          {row(t('ledger.snapshot.amount'), `${tx.type === 'income' ? '+' : '−'}${fmt.money(tx.amount, tx.currency)}`)}
          {tx.currency !== base && row(t('ledger.snapshot.base'), `≈ ${fmt.money(tx.baseAmount, base)}`)}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.5, marginTop: -4 }}>{t('ledger.snapshot.readonly')}</div>

        <label style={labelStyle}>
          {t('ledger.entry.category')}
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {categoryOptions.map((c) => <option key={c} value={c}>{catName(tx.type, c)}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          {t('ledger.entry.note')}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} style={inputStyle} />
        </label>

        {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}
        <button onClick={save} disabled={busy} style={{ width: '100%', padding: '11px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? t('common.processing') : t('common.save')}
        </button>
      </div>
    </>
  )
}

export default SnapshotTxSheet
