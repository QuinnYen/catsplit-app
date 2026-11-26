// 新增／編輯帳戶的底部面板。幣別建立後不可改；有帳目的帳戶不能刪除，只能封存。
import { useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import CurrencySelect from '../../components/CurrencySelect'
import { PINNED_CURRENCIES, roundToCurrency } from '../../config/currencies'
import { useLedger } from './LedgerContext'
import { createAccount, updateAccount, setAccountArchived, deleteAccount, accountHasTransactions } from './data'
import { ACCOUNT_TYPES, ACCOUNT_NAME_MAX } from './constants'
import BackClose from '../../components/BackClose'

const inputStyle = { display: 'block', width: '100%', marginTop: 6, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-card)', outline: 'none', boxSizing: 'border-box' }
const labelStyle = { fontSize: 12, color: 'var(--cs-text-sub)' }
const MAX_BALANCE = 1e11

// 期初餘額可以是負數（信用卡欠款）；空白視為 0。無效回傳 null
const parseBalance = (text, currency) => {
  const s = text.trim()
  if (s === '' || s === '-') return 0
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const v = roundToCurrency(Number(s), currency)
  return Math.abs(v) < MAX_BALANCE ? v : null
}

const AccountSheet = ({ account, activeNormalCount, onClose }) => {
  const { uid, ledger, showToast } = useLedger()
  const { t, fmt } = useI18n()
  const editing = !!account
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState(account?.type ?? 'bank')
  const [currency, setCurrency] = useState(account?.currency ?? ledger.baseCurrency)
  const [initial, setInitial] = useState(account ? String(account.initialBalance ?? 0) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // 最後一個可用的帳戶不能封存或刪除，否則無法記帳
  const isLastActive = editing && !account.archived && activeNormalCount <= 1

  const run = async (fn, doneKey) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      if (doneKey) showToast(t(doneKey))
      onClose()
    } catch (e) {
      console.error('Account operation failed', e)
      setError(t('ledger.account.failed'))
      setBusy(false)
    }
  }

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return setError(t('ledger.account.needName'))
    const balance = parseBalance(initial, currency)
    if (balance === null) return setError(t('ledger.account.badBalance'))
    run(
      () => (editing
        ? updateAccount(uid, ledger.id, account, { name: trimmed, type, initialBalance: balance })
        : createAccount(uid, ledger.id, { name: trimmed, type, currency, initialBalance: balance })),
      editing ? 'ledger.account.saved' : 'ledger.account.created',
    )
  }

  const toggleArchive = () => {
    if (!account.archived && isLastActive) return setError(t('ledger.account.lastOne'))
    run(() => setAccountArchived(uid, ledger.id, account.id, !account.archived), account.archived ? 'ledger.account.unarchived' : 'ledger.account.archived')
  }

  const remove = async () => {
    if (isLastActive) return setError(t('ledger.account.lastOne'))
    setBusy(true)
    setError('')
    try {
      if (await accountHasTransactions(uid, ledger.id, account.id)) {
        setError(t('ledger.account.hasTx'))
        setBusy(false)
        return
      }
    } catch (e) {
      console.error('Failed to check account transactions', e)
      setError(t('ledger.account.failed'))
      setBusy(false)
      return
    }
    setBusy(false)
    if (!window.confirm(t('ledger.account.deleteConfirm', { name: account.name }))) return
    run(() => deleteAccount(uid, ledger.id, account.id), 'ledger.account.deleted')
  }

  const secondary = { width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }

  return (
    <>
      <BackClose onClose={onClose} />
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--cs-overlay)' }} />
      <div
        role="dialog" aria-modal="true" aria-label={t(editing ? 'ledger.account.editTitle' : 'ledger.account.newTitle')}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 480, zIndex: 201, maxHeight: '92vh', overflowY: 'auto', background: 'var(--cs-bg)', borderRadius: '16px 16px 0 0', padding: '14px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cs-text)' }}>{t(editing ? 'ledger.account.editTitle' : 'ledger.account.newTitle')}</div>
          <button onClick={onClose} aria-label={t('ledger.entry.close')} style={{ background: 'none', border: 'none', color: 'var(--cs-text-sub)', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={20} /></button>
        </div>

        <label style={labelStyle}>
          {t('ledger.account.name')}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={ACCOUNT_NAME_MAX} placeholder={t('ledger.account.namePlaceholder')} autoFocus={!editing} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          {t('ledger.account.type')}
          <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
            {ACCOUNT_TYPES.map((k) => <option key={k} value={k}>{t(`ledger.accountType.${k}`)}</option>)}
          </select>
        </label>

        <div>
          <div style={labelStyle}>{t('ledger.account.currency')}</div>
          {editing ? (
            <div style={{ ...inputStyle, color: 'var(--cs-text-sub)', background: 'var(--cs-soft)' }}>{account.currency}</div>
          ) : (
            <div style={{ marginTop: 6 }}><CurrencySelect value={currency} onChange={setCurrency} pinned={[ledger.baseCurrency, ...PINNED_CURRENCIES]} /></div>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', marginTop: 6, lineHeight: 1.5 }}>{t('ledger.account.currencyHint')}</div>
        </div>

        <label style={labelStyle}>
          {t('ledger.account.initial', { currency: editing ? account.currency : currency })}
          <input value={initial} onChange={(e) => setInitial(e.target.value)} inputMode="decimal" placeholder="0" style={inputStyle} />
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-mute)', marginTop: 6, lineHeight: 1.5 }}>
            {editing ? t('ledger.account.initialEditHint', { balance: fmt.money(account.balance ?? 0, account.currency) }) : t('ledger.account.initialHint')}
          </span>
        </label>

        {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}

        <button onClick={save} disabled={busy} style={{ width: '100%', padding: '11px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? t('common.processing') : t('common.save')}
        </button>

        {editing && (
          <>
            <button onClick={toggleArchive} disabled={busy} style={secondary}>{t(account.archived ? 'ledger.account.unarchive' : 'ledger.account.archive')}</button>
            <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.5, marginTop: -6 }}>{t('ledger.account.archiveHint')}</div>
            <button onClick={remove} disabled={busy} style={{ ...secondary, border: '1px solid var(--cs-danger)', color: 'var(--cs-danger)' }}>{t('ledger.account.delete')}</button>
          </>
        )}
      </div>
    </>
  )
}

export default AccountSheet
