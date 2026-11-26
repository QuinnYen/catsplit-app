// 新增／編輯固定收支或固定轉帳規則的底部面板。編輯時起始日不可改；已產生的帳目不受影響，只影響之後。
// 幣別固定是帳戶幣別；帳戶幣別與統計幣別不同時，統計匯率存在規則上（建立時帶入當時匯率，可改）；固定轉帳兩個帳戶必須同幣別。
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { fetchExchangeRate, formatRate } from '../../config/currencies'
import { useLedger } from './LedgerContext'
import { createRecurring, updateRecurring, deleteRecurring } from './data'
import { FREQUENCIES, countBackfill, addDays, MAX_PER_RUN } from './recurring'
import { parseBudgetInput } from './budget'
import { todayStr, weekdayOf } from './dates'
import { NOTE_MAX } from './constants'
import BackClose from '../../components/BackClose'

const inputStyle = { display: 'block', width: '100%', marginTop: 6, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-card)', outline: 'none', boxSizing: 'border-box' }
const labelStyle = { fontSize: 12, color: 'var(--cs-text-sub)' }
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime())

const RecurringSheet = ({ transfer, rule, onClose }) => {
  const { uid, ledger, accounts, categories, catName, showToast, runRecurringNow } = useLedger()
  const { t } = useI18n()
  const editing = !!rule
  const today = todayStr()
  const usable = accounts.filter((a) => a.kind !== 'group' && (!a.archived || a.id === rule?.accountId || a.id === rule?.toAccountId))

  const [kind, setKind] = useState(rule?.kind ?? (transfer ? 'transfer' : 'expense'))
  const [name, setName] = useState(rule?.name ?? '')
  const [accountId, setAccountId] = useState(rule?.accountId ?? usable[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(rule?.toAccountId ?? usable.find((a) => a.id !== (rule?.accountId ?? usable[0]?.id))?.id ?? '')
  const [amount, setAmount] = useState(rule ? String(rule.amount) : '')
  const [category, setCategory] = useState(rule?.category ?? '')
  const [note, setNote] = useState(rule?.note ?? '')
  const [frequency, setFrequency] = useState(rule?.frequency ?? 'monthly')
  const [startDate, setStartDate] = useState(rule?.startDate ?? today)
  const [endDate, setEndDate] = useState(rule?.endDate ?? '')
  const [dayOfMonth, setDayOfMonth] = useState(rule?.dayOfMonth ?? Math.min(Number(today.slice(8)), 28))
  const [rateText, setRateText] = useState(rule?.rate ? String(rule.rate) : '')
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const account = usable.find((a) => a.id === accountId)
  const toAccount = usable.find((a) => a.id === toAccountId)
  const needsRate = !transfer && !!account && account.currency !== ledger.baseCurrency
  const categoryKeys = (kind === 'income' ? categories.income : categories.expense).map((c) => c.key)
  const categoryValue = categoryKeys.includes(category) ? category : (categoryKeys[0] ?? '')

  // 帳戶幣別與統計幣別不同時自動帶入目前匯率（沒填過才帶；抓不到要手動輸入）
  const accountCurrency = account?.currency
  useEffect(() => {
    if (!needsRate || rateText) return
    let cancelled = false
    fetchExchangeRate(accountCurrency, ledger.baseCurrency).then((r) => { if (!cancelled) setRateText(String(formatRate(r))) }).catch(() => {})
    return () => { cancelled = true }
  }, [needsRate, accountCurrency, ledger.baseCurrency]) // eslint-disable-line react-hooks/exhaustive-deps

  const parsedAmount = parseBudgetInput(amount)
  const candidate = { frequency, startDate, endDate: endDate || undefined, dayOfMonth: frequency === 'monthly' ? Number(dayOfMonth) : undefined }
  const backfill = !editing && isDate(startDate) && startDate <= today ? countBackfill(candidate, today) : 0

  const run = async (fn, doneKey) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      showToast(t(doneKey))
      onClose()
    } catch (e) {
      console.error('Failed to save recurring rule', e)
      setError(t('ledger.recurring.err.failed'))
      setBusy(false)
    }
  }

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return setError(t('ledger.recurring.err.name'))
    if (!parsedAmount) return setError(t('ledger.recurring.err.amount'))
    if (!account) return setError(t('ledger.recurring.err.account'))
    if (!isDate(startDate)) return setError(t('ledger.recurring.err.date'))
    if (endDate && (!isDate(endDate) || endDate < startDate)) return setError(t('ledger.recurring.err.endDate'))
    if (transfer) {
      if (!toAccount || toAccount.id === account.id) return setError(t('ledger.recurring.err.sameAccount'))
      if (toAccount.currency !== account.currency) return setError(t('ledger.recurring.err.currency'))
    }
    const rate = needsRate ? parseBudgetInput(rateText) : null
    if (needsRate && !rate) return setError(t('ledger.entry.needRate'))

    const data = {
      kind, name: trimmed, accountId, amount: parsedAmount, frequency, startDate,
      ...(transfer ? { toAccountId } : { category: categoryValue }),
      ...(note.trim() && { note: note.trim().slice(0, NOTE_MAX) }),
      ...(endDate && { endDate }),
      ...(frequency === 'monthly' && { dayOfMonth: Number(dayOfMonth) }),
      ...(rate && { rate }),
    }
    if (!editing) return run(async () => { await createRecurring(uid, ledger.id, data); runRecurringNow() }, 'ledger.recurring.created')
    // 編輯：起始日不改；不再適用的選填欄位移除；停用後重新啟用時，略過停用期間，從昨天之後算起
    const { startDate: _start, ...rest } = data // eslint-disable-line no-unused-vars
    const patch = { ...rest, enabled, note: data.note ?? null, endDate: data.endDate ?? null, dayOfMonth: data.dayOfMonth ?? null, rate: data.rate ?? null }
    if (enabled && rule.enabled === false) patch.generatedThrough = addDays(today, -1)
    run(async () => { await updateRecurring(uid, ledger.id, rule.id, patch); runRecurringNow() }, 'ledger.recurring.saved')
  }

  const remove = () => {
    if (window.confirm(t('ledger.recurring.deleteConfirm', { name: rule.name }))) run(() => deleteRecurring(uid, ledger.id, rule.id), 'ledger.recurring.deleted')
  }

  const accountOptions = (list) => list.map((a) => <option key={a.id} value={a.id}>{`${a.name} (${a.currency})`}</option>)
  const title = t(editing ? 'ledger.recurring.editTitle' : transfer ? 'ledger.recurring.newTransfer' : 'ledger.recurring.newEntry')

  return (
    <>
      <BackClose onClose={onClose} />
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--cs-overlay)' }} />
      <div
        role="dialog" aria-modal="true" aria-label={title}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 480, zIndex: 201, maxHeight: '92vh', overflowY: 'auto', background: 'var(--cs-bg)', borderRadius: '16px 16px 0 0', padding: '14px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cs-text)' }}>{title}</div>
          <button onClick={onClose} aria-label={t('ledger.entry.close')} style={{ background: 'none', border: 'none', color: 'var(--cs-text-sub)', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={20} /></button>
        </div>

        {!transfer && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--cs-soft)', borderRadius: 8, padding: 3 }}>
            {['expense', 'income'].map((k) => (
              <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} style={{ padding: '7px 0', border: 'none', borderRadius: 6, fontSize: 13.5, fontWeight: kind === k ? 600 : 400, background: kind === k ? 'var(--cs-card)' : 'transparent', color: kind === k ? 'var(--cs-text)' : 'var(--cs-text-sub)', cursor: 'pointer' }}>{t(`kind.${k}`)}</button>
            ))}
          </div>
        )}

        <label style={labelStyle}>{t('ledger.recurring.name')}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder={t('ledger.recurring.namePlaceholder')} style={inputStyle} />
        </label>

        <label style={labelStyle}>{t(transfer ? 'ledger.entry.from' : 'ledger.entry.account')}
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inputStyle}>{accountOptions(usable)}</select>
        </label>
        {transfer && (
          <label style={labelStyle}>{t('ledger.entry.to')}
            <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} style={inputStyle}>{accountOptions(usable.filter((a) => a.id !== accountId))}</select>
          </label>
        )}

        <label style={labelStyle}>{t('ledger.recurring.amount', { currency: account?.currency ?? '' })}
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" style={inputStyle} />
        </label>

        {needsRate && (
          <label style={labelStyle}>{t('ledger.recurring.rate', { from: account.currency, to: ledger.baseCurrency })}
            <input value={rateText} onChange={(e) => setRateText(e.target.value)} inputMode="decimal" style={inputStyle} />
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-mute)', marginTop: 4 }}>{t('ledger.recurring.rateHint')}</span>
          </label>
        )}

        {!transfer && (
          <label style={labelStyle}>{t('ledger.entry.category')}
            <select value={categoryValue} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              {categoryKeys.map((c) => <option key={c} value={c}>{catName(kind, c)}</option>)}
            </select>
          </label>
        )}

        <label style={labelStyle}>{t('ledger.recurring.frequency')}
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={inputStyle}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`ledger.recurring.freq.${f}`)}</option>)}
          </select>
        </label>
        {frequency === 'monthly' && (
          <label style={labelStyle}>{t('ledger.recurring.dayOfMonth')}
            <select value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} style={inputStyle}>
              {[...Array.from({ length: 28 }, (_, i) => i + 1), 0].map((d) => <option key={d} value={d}>{d === 0 ? t('ledger.adv.monthEnd') : t('ledger.adv.day', { n: d })}</option>)}
            </select>
          </label>
        )}

        <label style={labelStyle}>{t('ledger.recurring.startDate')}
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={editing} style={{ ...inputStyle, opacity: editing ? 0.6 : 1 }} />
          {frequency === 'weekly' && isDate(startDate) && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-mute)', marginTop: 4 }}>{t('ledger.recurring.weeklyOn', { weekday: t(`date.weekday.${weekdayOf(startDate)}`) })}</span>}
          {frequency === 'yearly' && isDate(startDate) && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-mute)', marginTop: 4 }}>{t('ledger.recurring.yearlyOn', { date: `${Number(startDate.slice(5, 7))}/${Number(startDate.slice(8))}` })}</span>}
        </label>
        {backfill > 0 && <div role="status" style={{ fontSize: 12, color: 'var(--cs-warn)', lineHeight: 1.6 }}>{t('ledger.recurring.backfill', { n: Math.min(backfill, MAX_PER_RUN), more: backfill > MAX_PER_RUN ? t('ledger.recurring.backfillMore') : '' })}</div>}

        <label style={labelStyle}>{t('ledger.recurring.endDate')}
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        </label>

        <label style={labelStyle}>{t('ledger.entry.note')}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} style={inputStyle} />
        </label>

        {editing && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--cs-text)' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t('ledger.recurring.enabled')}
          </label>
        )}

        {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}
        <button onClick={save} disabled={busy} style={{ width: '100%', padding: '11px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? t('common.processing') : t('common.save')}
        </button>
        {editing && <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.5 }}>{t('ledger.recurring.editHint')}</div>}
        {editing && (
          <button onClick={remove} disabled={busy} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-danger)', background: 'transparent', color: 'var(--cs-danger)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}>{t('ledger.recurring.delete')}</button>
        )}
      </div>
    </>
  )
}

export default RecurringSheet
