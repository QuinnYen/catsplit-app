// 記帳面板（spec 3.1）：從底部彈出；日期整行、類別與帳戶並排、備註占滿中間、金額列、常駐數字鍵盤。
// 面板只收集輸入並顯示換算；驗證與換算在 entryDraft.js，寫入在 data.js。
import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { categoryLabel } from '../../i18n/codes'
import useExchangeRate from '../../hooks/useExchangeRate'
import CurrencySelect from '../../components/CurrencySelect'
import { PINNED_CURRENCIES, getCurrency, roundToCurrency } from '../../config/currencies'
import { useLedger } from './LedgerContext'
import NumberPad from './NumberPad'
import { pressKey, evaluateExpression, commitExpression, hasOperator } from './expression'
import { buildTransactionData, draftFromTransaction } from './entryDraft'
import { saveTransaction, deleteTransaction } from './data'
import { readLastUsed, writeLastUsed, pickEntryDefaults } from './prefs'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, NOTE_MAX } from './constants'
import { todayStr, weekdayOf } from './dates'

const accountLabel = (a) => `${a.name} (${a.currency})`
const categoriesOf = (kind) => (kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)

const fieldBox = { display: 'flex', alignItems: 'center', gap: 6, border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', borderRadius: 10, padding: '0 12px', minHeight: 44, minWidth: 0 }
const fieldLabel = { fontSize: 11.5, color: 'var(--cs-text-sub)', flexShrink: 0 }
const selectStyle = { flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, padding: '10px 0', outline: 'none' }
const smallInput = { border: '0.5px solid var(--cs-border)', background: 'var(--cs-bg)', color: 'var(--cs-text)', borderRadius: 6, padding: '6px 8px', fontSize: 14, outline: 'none', textAlign: 'right' }

const initialDraft = ({ editing, uid, ledgerId, selectable, selectedDate }) => {
  if (editing) return { ...draftFromTransaction(editing), currencyTouched: true }
  const last = readLastUsed(localStorage, uid, ledgerId)
  const { accountId, category } = pickEntryDefaults({ accounts: selectable, last, kind: 'expense', categories: EXPENSE_CATEGORIES })
  const account = selectable.find((a) => a.id === accountId)
  return {
    kind: 'expense', expr: '', currency: account?.currency ?? '', accountId, category, note: '', date: selectedDate,
    toAccountId: selectable.find((a) => a.id !== accountId)?.id ?? '', accountAmount: '', toAmount: '', sourceType: 'manual', currencyTouched: false,
  }
}

// 匯率輸入列：沿用分帳記帳表單的行為（自動帶入、可修改、抓取失敗要手動輸入）
const RateRow = ({ from, to, state }) => {
  const { t } = useI18n()
  const { exchangeRate, setManualRate, rateLoading, rateError, rateManual } = state
  return (
    <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--cs-bg)', border: '0.5px solid var(--cs-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--cs-text-sub)' }}>{t('form.rate', { currency: from })}</span>
        {rateLoading ? (
          <span style={{ fontSize: 12, color: 'var(--cs-text-mute)' }}>{t('form.rateLoading')}</span>
        ) : (
          <input
            type="number" step="any" min="0" value={exchangeRate ?? ''} onChange={(e) => setManualRate(parseFloat(e.target.value) || null)}
            placeholder={t('form.rateEnter')} aria-label={t('form.rate', { currency: from })}
            style={{ ...smallInput, width: 100, textAlign: 'left', border: `0.5px solid ${rateError ? 'var(--cs-danger)' : 'var(--cs-rc-stamp)'}` }}
          />
        )}
        <span style={{ fontSize: 12, color: 'var(--cs-text-sub)' }}>{to}</span>
      </div>
      {!rateLoading && (
        <div style={{ marginTop: 4, fontSize: 11, color: rateError ? 'var(--cs-danger)' : 'var(--cs-text-mute)' }}>
          {rateError ? t('form.rateError') : rateManual ? t('form.rateManual') : t('form.rateAuto')}
        </div>
      )}
    </div>
  )
}

const LedgerEntrySheet = ({ editing, onClose }) => {
  const { uid, ledger, accounts, selectedDate, setSelectedDate, showToast } = useLedger()
  const { t, fmt } = useI18n()
  const base = ledger.baseCurrency

  // 快照帳戶（群組同步用）不能手動記帳；封存的帳戶只有編輯舊帳時才保留
  const selectable = useMemo(
    () => accounts.filter((a) => a.kind !== 'group' && (!a.archived || a.id === editing?.accountId || a.id === editing?.toAccountId)),
    [accounts, editing],
  )
  const [d, setD] = useState(() => initialDraft({ editing, uid, ledgerId: ledger.id, selectable, selectedDate }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch) => setD((prev) => ({ ...prev, ...patch }))

  // 面板開著時鎖住背景捲動
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const transfer = d.kind === 'transfer'
  const account = selectable.find((a) => a.id === d.accountId)
  const toAccount = selectable.find((a) => a.id === d.toAccountId)
  const currency = transfer ? (account?.currency ?? '') : (d.currency || account?.currency || '')
  const amount = evaluateExpression(d.expr)
  const op = hasOperator(d.expr)

  // 匯率：統計幣別、扣款帳戶幣別（跨幣別帳目）、轉入帳戶幣別（跨幣別轉帳）。編輯舊帳時先沿用當時存的匯率
  const savedBase = editing && !transfer && editing.currency === currency ? { currency, rate: editing.exchangeRate } : undefined
  const savedAccount = editing?.accountRate && editing.currency === currency ? { currency, rate: editing.accountRate } : undefined
  const baseRate = useExchangeRate(currency, transfer ? currency : base, savedBase)
  // 帳戶幣別等於統計幣別時，扣款匯率就是統計匯率（同一組幣別），不另外抓、也不用輸入第二次
  const accountIsBase = !transfer && account?.currency === base
  const accountRate = useExchangeRate(currency, transfer || accountIsBase ? currency : (account?.currency ?? currency), savedAccount)
  const accountRateValue = accountIsBase ? baseRate.exchangeRate : accountRate.exchangeRate
  const transferRate = useExchangeRate(transfer ? currency : 'x', transfer ? (toAccount?.currency ?? currency) : 'x')

  const built = buildTransactionData({
    draft: {
      kind: d.kind, amount: op ? null : amount, date: d.date, note: d.note, accountId: d.accountId, currency, category: d.category,
      baseRate: baseRate.exchangeRate, accountRate: accountRateValue, accountAmount: d.accountAmount,
      toAccountId: d.toAccountId, toAmount: d.toAmount, transferRate: transferRate.exchangeRate, sourceType: d.sourceType,
    },
    accounts: selectable,
    ledgerBaseCurrency: base,
  })
  const canSave = built.ok && !busy
  const rateMissing = !built.ok && ['baseRate', 'accountRate', 'transferRate'].includes(built.reason)

  const categories = categoriesOf(d.kind)
  const categoryOptions = !d.category || categories.includes(d.category) ? categories : [d.category, ...categories]

  const switchKind = (kind) => setD((prev) => {
    const next = { ...prev, kind, accountAmount: '', toAmount: '' }
    if (kind !== 'transfer') {
      next.category = pickEntryDefaults({ accounts: selectable, last: readLastUsed(localStorage, uid, ledger.id), kind, categories: categoriesOf(kind) }).category
    } else if (!prev.toAccountId || prev.toAccountId === prev.accountId) {
      next.toAccountId = selectable.find((a) => a.id !== prev.accountId)?.id ?? ''
    }
    return next
  })

  const pickAccount = (id) => setD((prev) => {
    const acct = selectable.find((a) => a.id === id)
    const next = { ...prev, accountId: id, accountAmount: '', toAmount: '' }
    if (!prev.currencyTouched && acct) next.currency = acct.currency
    if (prev.toAccountId === id) next.toAccountId = selectable.find((a) => a.id !== id)?.id ?? ''
    return next
  })

  const pickToAccount = (id) => setD((prev) => ({
    ...prev, toAccountId: id, toAmount: '',
    ...(prev.accountId === id && { accountId: selectable.find((a) => a.id !== id)?.id ?? '' }),
  }))

  const swapAccounts = () => set({ accountId: d.toAccountId, toAccountId: d.accountId, toAmount: '' })

  const submit = async (again) => {
    if (op) { // 有算式時，主按鈕是「＝」：先算出結果，再按一次才儲存
      set({ expr: commitExpression(d.expr, getCurrency(currency || base).decimals) })
      return
    }
    if (!built.ok || busy) return
    setBusy(true)
    setError('')
    try {
      await saveTransaction(uid, ledger.id, { id: editing?.id, data: built.data, oldTx: editing ?? undefined })
      if (!transfer) writeLastUsed(localStorage, uid, ledger.id, { accountId: d.accountId, [d.kind === 'income' ? 'incomeCategory' : 'expenseCategory']: d.category })
      else writeLastUsed(localStorage, uid, ledger.id, { accountId: d.accountId })
      setSelectedDate(d.date)
      showToast(t('ledger.entry.saved'))
      if (again && !editing) {
        setD((prev) => ({ ...prev, expr: '', note: '', accountAmount: '', toAmount: '' }))
        setBusy(false)
      } else onClose()
    } catch (e) {
      console.error('Failed to save transaction', e)
      setError(t('ledger.entry.saveFailed'))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!editing || busy || !window.confirm(t('ledger.entry.confirmDelete'))) return
    setBusy(true)
    try {
      await deleteTransaction(uid, ledger.id, editing)
      showToast(t('ledger.entry.deleted'))
      onClose()
    } catch (e) {
      console.error('Failed to delete transaction', e)
      setError(t('ledger.entry.saveFailed'))
      setBusy(false)
    }
  }

  // 換算資訊（只有需要時才出現）
  const baseEstimate = !transfer && currency !== base && amount > 0 && baseRate.exchangeRate ? roundToCurrency(amount * baseRate.exchangeRate, base) : null
  const accountEstimate = !transfer && account && currency !== account.currency && amount > 0 && accountRateValue ? roundToCurrency(amount * accountRateValue, account.currency) : ''
  const toEstimate = transfer && account && toAccount && toAccount.currency !== account.currency && amount > 0 && transferRate.exchangeRate ? roundToCurrency(amount * transferRate.exchangeRate, toAccount.currency) : ''
  const amountColor = d.kind === 'income' ? 'var(--cs-rc-get)' : d.kind === 'expense' ? 'var(--cs-rc-owe)' : 'var(--cs-text)'
  const shownAmount = op ? `= ${fmt.num(amount ?? 0)}` : (d.expr || '0')
  const weekday = d.date ? t(`date.weekday.${weekdayOf(d.date)}`) : ''

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--cs-overlay)' }} />
      <div
        role="dialog" aria-modal="true" aria-label={t(editing ? 'ledger.entry.editTitle' : 'ledger.entry.title')}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 480, zIndex: 201, height: 'min(94vh, 740px)', background: 'var(--cs-bg)', borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', boxShadow: '0 -6px 24px rgba(0,0,0,0.3)' }}
      >
        {/* 種類切換與關閉 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 8px', flexShrink: 0 }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: 'var(--cs-soft)', borderRadius: 8, padding: 3 }}>
            {[['expense', t('kind.expense')], ['income', t('kind.income')], ['transfer', t('ledger.kind.transfer')]].map(([k, label]) => (
              <button
                key={k} type="button" onClick={() => switchKind(k)} disabled={k === 'transfer' && selectable.length < 2}
                style={{ border: 'none', padding: '7px 0', borderRadius: 6, fontSize: 13, cursor: k === 'transfer' && selectable.length < 2 ? 'not-allowed' : 'pointer', opacity: k === 'transfer' && selectable.length < 2 ? 0.4 : 1, background: d.kind === k ? 'var(--cs-card)' : 'transparent', color: d.kind === k ? 'var(--cs-text)' : 'var(--cs-text-sub)', fontWeight: d.kind === k ? 700 : 400 }}
              >{label}</button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label={t('ledger.entry.close')} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'var(--cs-soft)', color: 'var(--cs-text-sub)', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>

        {/* 第一行日期、第二行類別與帳戶、其餘留給備註 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '0 14px 8px' }}>
          <label style={{ ...fieldBox, minHeight: 52, gap: 10, flexShrink: 0 }}>
            <span style={fieldLabel}>{t('ledger.entry.date')}</span>
            <input
              type="date" value={d.date} onChange={(e) => set({ date: e.target.value })}
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'var(--cs-text)', fontSize: 18, fontWeight: 600, outline: 'none', padding: 0 }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cs-rc-stamp)' }}>
              {d.date === todayStr() ? t('ledger.entry.today') : weekday}
            </span>
          </label>

          {transfer ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <label style={fieldBox}>
                <span style={fieldLabel}>{t('ledger.entry.from')}</span>
                <select value={d.accountId} onChange={(e) => pickAccount(e.target.value)} style={selectStyle}>
                  {selectable.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                </select>
              </label>
              <button type="button" onClick={swapAccounts} aria-label={t('ledger.entry.swap')} style={{ alignSelf: 'center', width: 34, height: 34, borderRadius: '50%', border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-text-sub)', cursor: 'pointer' }}>⇄</button>
              <label style={fieldBox}>
                <span style={fieldLabel}>{t('ledger.entry.to')}</span>
                <select value={d.toAccountId} onChange={(e) => pickToAccount(e.target.value)} style={selectStyle}>
                  {selectable.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                </select>
              </label>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <label style={{ ...fieldBox, flex: 1 }}>
                <span style={fieldLabel}>{t('ledger.entry.category')}</span>
                <select value={d.category} onChange={(e) => set({ category: e.target.value })} style={selectStyle}>
                  {categoryOptions.map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
                </select>
              </label>
              <label style={{ ...fieldBox, flex: 1 }}>
                <span style={fieldLabel}>{t('ledger.entry.account')}</span>
                <select value={d.accountId} onChange={(e) => pickAccount(e.target.value)} style={selectStyle}>
                  {selectable.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                </select>
              </label>
            </div>
          )}

          <textarea
            value={d.note} onChange={(e) => set({ note: e.target.value })} maxLength={NOTE_MAX} placeholder={t('ledger.entry.note')} aria-label={t('ledger.entry.note')}
            style={{ flex: 1, minHeight: 56, width: '100%', resize: 'none', border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-text)', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }}
          />
        </div>

        {/* 金額列與換算 */}
        <div style={{ background: 'var(--cs-card)', borderTop: '1px solid var(--cs-border)', padding: '8px 14px 6px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 104, flexShrink: 0 }}>
              {transfer || !account ? (
                <div style={{ ...fieldBox, minHeight: 38, justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--cs-text)' }}>{currency}</div>
              ) : (
                <CurrencySelect value={currency} onChange={(c) => set({ currency: c, currencyTouched: true, accountAmount: '' })} compact pinned={[base, account.currency, ...PINNED_CURRENCIES]} ariaLabel={t('ledger.entry.currency')} style={{ padding: '8px 10px', fontWeight: 600 }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }} aria-live="polite">
              <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', minHeight: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{op ? d.expr : ''}</div>
              <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1, color: amountColor, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shownAmount}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {!transfer && currency !== base && (
              <>
                <RateRow from={currency} to={base} state={baseRate} />
                {baseEstimate != null && <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--cs-text-sub)' }}>{t('ledger.entry.baseAmount', { amount: fmt.money(baseEstimate, base) })}</div>}
              </>
            )}
            {!transfer && account && currency !== account.currency && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: 'var(--cs-text-sub)' }}>
                  <span>{t('ledger.entry.accountAmount', { currency: account.currency })}</span>
                  <input type="number" inputMode="decimal" step="any" min="0" value={d.accountAmount} onChange={(e) => set({ accountAmount: e.target.value })} placeholder={accountEstimate === '' ? '' : String(accountEstimate)} style={{ ...smallInput, width: 120 }} />
                </label>
                <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--cs-text-mute)' }}>{t('ledger.entry.accountHint')}</div>
              </>
            )}
            {transfer && account && toAccount && toAccount.currency !== account.currency && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: 'var(--cs-text-sub)' }}>
                  <span>{t('ledger.entry.toAmount', { currency: toAccount.currency })}</span>
                  <input type="number" inputMode="decimal" step="any" min="0" value={d.toAmount} onChange={(e) => set({ toAmount: e.target.value })} placeholder={toEstimate === '' ? '' : String(toEstimate)} style={{ ...smallInput, width: 120 }} />
                </label>
                <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--cs-text-mute)' }}>{t('ledger.entry.toAmountHint')}</div>
              </>
            )}
            {rateMissing && amount > 0 && !op && <div role="alert" style={{ textAlign: 'right', fontSize: 12, color: 'var(--cs-danger)' }}>{t('ledger.entry.needRate')}</div>}
            {selectable.length === 0 && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{t('ledger.entry.noAccount')}</div>}
            {error && <div role="alert" style={{ textAlign: 'right', fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}
          </div>
        </div>

        <NumberPad onKey={(k) => setD((prev) => ({ ...prev, expr: pressKey(prev.expr, k) }))} />

        <div style={{ display: 'flex', gap: 8, padding: '8px 14px calc(8px + env(safe-area-inset-bottom, 0px))', background: 'var(--cs-card)', flexShrink: 0 }}>
          {editing ? (
            <button type="button" onClick={remove} disabled={busy} aria-label={t('ledger.entry.delete')} style={{ flex: '0 0 38%', padding: 13, borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-danger)', fontSize: 14, fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Trash2 size={16} />{t('ledger.entry.delete')}
            </button>
          ) : (
            <button type="button" onClick={() => submit(true)} disabled={!canSave || op} style={{ flex: '0 0 38%', padding: 13, borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, fontWeight: 500, cursor: canSave && !op ? 'pointer' : 'not-allowed', opacity: canSave && !op ? 1 : 0.45 }}>
              {t('ledger.entry.saveNext')}
            </button>
          )}
          <button
            type="button" onClick={() => submit(false)} disabled={op ? false : !canSave}
            style={{ flex: 1, padding: 13, borderRadius: 6, border: 'none', fontSize: 15, fontWeight: 600, cursor: op || canSave ? 'pointer' : 'not-allowed', background: op || canSave ? 'var(--cs-rc-stamp)' : 'var(--cs-line-soft)', color: 'var(--cs-rc-stamp-text)' }}
          >
            {op ? t('ledger.entry.equals') : busy ? t('common.saving') : t('ledger.entry.save')}
          </button>
        </div>
      </div>
    </>
  )
}

export default LedgerEntrySheet
