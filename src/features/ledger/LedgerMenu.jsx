// 帳本切換與新增：帳本主頁左上角圓鈕打開。新增帳本要先說明統計幣別建立後不可改。
import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import CurrencySelect from '../../components/CurrencySelect'
import { PINNED_CURRENCIES } from '../../config/currencies'
import { useLedger } from './LedgerContext'
import { createLedger, renameLedger } from './data'
import { deleteLedger } from '../../utils/ledgerApi'
import { MAX_LEDGERS, LEDGER_NAME_MAX } from './constants'
import BackClose from '../../components/BackClose'

const LedgerMenu = ({ onClose }) => {
  const { uid, ledgers, ledger, setActiveLedger, showToast } = useLedger()
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(ledger.baseCurrency)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // { id, name } | null

  const pick = (id) => {
    setActiveLedger(id)
    onClose()
  }

  const saveEdit = async () => {
    const trimmed = editing.name.trim()
    if (!trimmed) return setError(t('ledger.new.needName'))
    setBusy(true)
    setError('')
    try {
      await renameLedger(uid, editing.id, trimmed)
      showToast(t('ledger.edit.saved'))
      setEditing(null)
    } catch (e) {
      console.error('Failed to rename ledger', e)
      setError(t('ledger.edit.failed'))
    }
    setBusy(false)
  }

  const removeLedger = async (l) => {
    if (ledgers.length <= 1 || busy || !window.confirm(t('ledger.edit.deleteConfirm', { name: l.name }))) return
    setBusy(true)
    setError('')
    try {
      await deleteLedger(l.id)
      showToast(t('ledger.edit.deleted'))
      onClose()
    } catch (e) {
      console.error('Failed to delete ledger', e)
      setError(t('ledger.edit.deleteFailed'))
      setBusy(false)
    }
  }

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) return setError(t('ledger.new.needName'))
    if (ledgers.length >= MAX_LEDGERS) return setError(t('ledger.new.limit', { n: MAX_LEDGERS }))
    setBusy(true)
    setError('')
    try {
      const id = await createLedger(uid, { name: trimmed, baseCurrency: currency, cashName: t('ledger.default.cash') })
      setActiveLedger(id)
      showToast(t('ledger.new.created', { name: trimmed }))
      onClose()
    } catch (e) {
      console.error('Failed to create ledger', e)
      setError(t('ledger.new.failed'))
      setBusy(false)
    }
  }

  return (
    <>
      <BackClose onClose={onClose} />
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--cs-overlay)' }} />
      <div
        role="dialog" aria-label={t('ledger.switch')}
        style={{ position: 'fixed', top: 64, left: 12, right: 12, margin: '0 auto', maxWidth: 456, zIndex: 101, background: 'var(--cs-card)', border: '0.5px solid var(--cs-border)', borderRadius: 8, padding: '4px 14px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.28)', maxHeight: '70vh', overflowY: 'auto' }}
      >
        {ledgers.map((l) => (
          <div key={l.id} style={{ borderBottom: '0.5px solid var(--cs-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => pick(l.id)}
                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', padding: '12px 2px', textAlign: 'left', cursor: 'pointer' }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: l.id === ledger.id ? 700 : 500, color: l.id === ledger.id ? 'var(--cs-rc-owe)' : 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-sub)', marginTop: 2 }}>{t('ledger.baseCaption', { currency: l.baseCurrency })}</span>
                </span>
                {l.id === ledger.id && <Check size={16} color="var(--cs-rc-owe)" />}
              </button>
              <button
                onClick={() => { setError(''); setAdding(false); setEditing(editing?.id === l.id ? null : { id: l.id, name: l.name }) }}
                aria-label={t('ledger.edit.open', { name: l.name })} aria-expanded={editing?.id === l.id}
                style={{ background: 'none', border: 'none', padding: 8, color: 'var(--cs-text-sub)', cursor: 'pointer', display: 'flex' }}
              ><Pencil size={16} /></button>
            </div>
            {editing?.id === l.id && (
              <div style={{ padding: '4px 2px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--cs-text-sub)' }}>
                  {t('ledger.new.name')}
                  <input
                    value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={LEDGER_NAME_MAX} autoFocus
                    style={{ display: 'block', width: '100%', marginTop: 6, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-bg)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </label>
                <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)' }}>{t('ledger.edit.currencyLocked', { currency: l.baseCurrency })}</div>
                {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveEdit} disabled={busy} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                    {busy ? t('common.processing') : t('common.save')}
                  </button>
                  <button onClick={() => { setEditing(null); setError('') }} disabled={busy} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: 'pointer' }}>
                    {t('common.cancel')}
                  </button>
                </div>
                <button onClick={() => removeLedger(l)} disabled={ledgers.length <= 1 || busy} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-danger)', background: 'transparent', color: 'var(--cs-danger)', fontSize: 14, cursor: ledgers.length <= 1 || busy ? 'not-allowed' : 'pointer', opacity: ledgers.length <= 1 ? 0.5 : 1 }}>
                  {t('ledger.edit.delete')}
                </button>
                {ledgers.length <= 1 && <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', textAlign: 'center' }}>{t('ledger.edit.deleteLast')}</div>}
              </div>
            )}
          </div>
        ))}

        {adding ? (
          <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--cs-text-sub)' }}>
              {t('ledger.new.name')}
              <input
                value={name} onChange={(e) => setName(e.target.value)} maxLength={LEDGER_NAME_MAX} placeholder={t('ledger.new.namePlaceholder')} autoFocus
                style={{ display: 'block', width: '100%', marginTop: 6, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-bg)', outline: 'none' }}
              />
            </label>
            <div>
              <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', marginBottom: 6 }}>{t('ledger.new.currency')}</div>
              <CurrencySelect value={currency} onChange={setCurrency} pinned={PINNED_CURRENCIES} />
              <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', marginTop: 6, lineHeight: 1.5 }}>{t('ledger.new.currencyHint')}</div>
            </div>
            {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={create} disabled={busy} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? t('common.processing') : t('ledger.new.create')}
              </button>
              <button onClick={() => { setAdding(false); setError('') }} disabled={busy} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: 'pointer' }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setEditing(null); setError(''); setAdding(true) }} style={{ width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: 'pointer' }}>
            {t('ledger.new')}
          </button>
        )}
      </div>
    </>
  )
}

export default LedgerMenu
