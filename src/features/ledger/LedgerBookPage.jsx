// /ledger — 帳本主頁：header（帳本切換、月份、圖表、支出收入結餘）、月曆（有帳目的日期標點）、選取日期的明細。
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, BarChart3 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { categoryLabel } from '../../i18n/codes'
import MonthPicker from '../../components/MonthPicker'
import { useLedger } from './LedgerContext'
import LedgerMenu from './LedgerMenu'
import { useMonthTransactions } from './hooks'
import { monthGrid, summarizeEntries, datesWithEntries, entriesOfDate } from './summary'
import { entryHeadline } from './entryDraft'
import { todayStr, monthKeyOf, weekdayOf, shiftMonthDate, dateForMonth, shortDate } from './dates'

const circleBtn = { width: 36, height: 36, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.65)', background: 'none', color: 'var(--cs-rc-head-text)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }

const LedgerBookPage = () => {
  const { uid, ledger, accounts, selectedDate, setSelectedDate, openEntry } = useLedger()
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const monthKey = monthKeyOf(selectedDate)
  const txs = useMonthTransactions(uid, ledger.id, monthKey)
  const list = useMemo(() => txs ?? [], [txs])
  const base = ledger.baseCurrency
  const today = todayStr()
  const [year, month] = monthKey.split('-').map(Number)

  const totals = useMemo(() => summarizeEntries(list), [list])
  const marked = useMemo(() => datesWithEntries(list), [list])
  const grid = useMemo(() => monthGrid(monthKey), [monthKey])
  const day = useMemo(() => entriesOfDate(list, selectedDate), [list, selectedDate])
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const label = (c) => categoryLabel(c, t)

  const stat = (name, value) => (
    <div style={{ textAlign: 'center' }}>
      <span style={{ opacity: 0.75, marginRight: 4 }}>{name}</span>
      <b style={{ fontWeight: 600 }}>{fmt.num(value)}</b>
    </div>
  )

  const renderRow = (tx) => {
    const account = accountById.get(tx.accountId)
    const accountCurrency = account?.currency ?? tx.currency
    let amountText
    let sub
    if (tx.type === 'transfer') {
      const to = accountById.get(tx.toAccountId)
      amountText = fmt.money(tx.amount, tx.currency) + (to && to.currency !== tx.currency ? ` → ${fmt.money(tx.toAmount, to.currency)}` : '')
      sub = `${account?.name ?? ''} → ${to?.name ?? ''}`
    } else {
      amountText = `${tx.type === 'income' ? '+' : '−'}${fmt.money(tx.amount, tx.currency)}`
      const charged = tx.accountAmount != null && tx.currency !== accountCurrency
      sub = [
        account?.name,
        // 沒有標題與備註時，分類已經當標題了，不重複顯示
        tx.title || tx.note ? label(tx.category) : null,
        charged ? t('ledger.row.charged', { amount: fmt.money(tx.accountAmount, accountCurrency) }) : null,
        // 扣款帳戶幣別就是統計幣別時，扣款金額已經是統計金額，不再重複
        tx.currency !== base && !(charged && accountCurrency === base) ? `≈ ${fmt.money(tx.baseAmount, base)}` : null,
      ].filter(Boolean).join(' · ')
    }
    const headline = tx.type === 'transfer' ? (tx.note || t('ledger.kind.transfer')) : entryHeadline(tx, label)
    const initial = (tx.type === 'transfer' ? t('ledger.kind.transfer') : label(tx.category)).charAt(0)
    const tone = tx.type === 'income' ? 'var(--cs-rc-get)' : tx.type === 'expense' ? 'var(--cs-rc-owe)' : 'var(--cs-text-sub)'
    return (
      <button
        key={tx.id} onClick={() => openEntry(tx)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', borderBottom: '0.5px solid var(--cs-border)', textAlign: 'left', cursor: 'pointer' }}
      >
        <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0, background: 'var(--cs-soft)', color: tone }}>{initial}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headline}</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-sub)', marginTop: 2 }}>{sub}</span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: tone, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{amountText}</span>
      </button>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', color: 'var(--cs-rc-head-text)', padding: '14px 16px 24px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={() => setMenuOpen(true)} aria-label={t('ledger.switch')} aria-haspopup="dialog" style={circleBtn}><Layers size={18} /></button>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => setSelectedDate(shiftMonthDate(selectedDate, -1))} aria-label={t('month.prev')} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 22, lineHeight: 1, padding: '0 10px', cursor: 'pointer' }}>‹</button>
            <button onClick={() => setPickerOpen(true)} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 15, fontWeight: 600, padding: '4px 6px', cursor: 'pointer' }}>
              {t('ledger.month.label', { year, month })} ▾
            </button>
            <button onClick={() => setSelectedDate(shiftMonthDate(selectedDate, 1))} aria-label={t('month.next')} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 22, lineHeight: 1, padding: '0 10px', cursor: 'pointer' }}>›</button>
          </div>
          <button onClick={() => navigate('/ledger/stats')} aria-label={t('ledger.chart')} style={circleBtn}><BarChart3 size={18} /></button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.75, marginTop: 6 }}>{ledger.name} · {t('ledger.baseCaption', { currency: base })}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 10, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
          {stat(t('kind.expense'), totals.expense)}
          {stat(t('kind.income'), totals.income)}
          {stat(t('ledger.stat.balance'), totals.balance)}
        </div>
      </div>

      <div className="cs-body" style={{ padding: '8px 10px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} style={{ textAlign: 'center', fontSize: 11, color: 'var(--cs-text-mute)', padding: '2px 0 4px' }}>{t(`date.weekday.${i}`)}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {Array.from({ length: grid.leading }, (_, i) => <span key={`b${i}`} />)}
          {grid.dates.map((date) => {
            const selected = date === selectedDate
            return (
              <button
                key={date} onClick={() => setSelectedDate(date)} aria-pressed={selected}
                style={{ border: 'none', background: 'none', padding: '3px 0 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minHeight: 40, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
              >
                <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontVariantNumeric: 'tabular-nums', background: selected ? 'var(--cs-rc-stamp)' : 'transparent', color: selected ? 'var(--cs-rc-stamp-text)' : 'var(--cs-text)', fontWeight: selected ? 700 : 400, boxShadow: date === today && !selected ? 'inset 0 0 0 1.5px var(--cs-rc-stamp)' : 'none' }}>
                  {Number(date.slice(8))}
                </span>
                <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', marginTop: 1, background: marked.has(date) ? 'var(--cs-rc-stamp)' : 'transparent' }} />
              </button>
            )
          })}
        </div>
      </div>

      <div className="cs-body" style={{ marginTop: 8, flex: 1 }}>
        <div style={{ background: 'var(--cs-rc-card)', borderTop: '1px solid var(--cs-rc-rule)', minHeight: 200 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '10px 16px 8px', borderBottom: '1.5px dashed var(--cs-rc-rule)' }}>
            <b style={{ fontSize: 14, color: 'var(--cs-text)' }}>{t('ledger.day.header', { date: shortDate(selectedDate), weekday: t(`date.weekday.${weekdayOf(selectedDate)}`) })}</b>
            <span style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--cs-text-sub)', fontVariantNumeric: 'tabular-nums' }}>
              <span>{t('kind.expense')} {fmt.num(day.expense)}</span>
              <span>{t('kind.income')} {fmt.num(day.income)}</span>
            </span>
          </div>
          {txs === null
            ? <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--cs-text-mute)', fontSize: 13 }}>{t('common.loading')}</div>
            : day.items.length === 0
              ? <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--cs-text-mute)', fontSize: 13 }}>{t('ledger.day.empty')}</div>
              : day.items.map(renderRow)}
        </div>
      </div>

      {menuOpen && <LedgerMenu onClose={() => setMenuOpen(false)} />}
      {pickerOpen && (
        <MonthPicker
          value={monthKey}
          onPick={(key) => { setPickerOpen(false); setSelectedDate(dateForMonth(key)) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

export default LedgerBookPage
