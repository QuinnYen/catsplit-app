// 設定的「固定收支與轉帳」內頁：規則列表（頻率、金額、下次日期、停用狀態）、新增與編輯。
// 開啟帳本時由 useRecurringRun 補入漏掉的項目；沒有後端排程。
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from './LedgerContext'
import RecurringSheet from './RecurringSheet'
import { scheduledDates, addDays } from './recurring'
import { todayStr, weekdayOf, shortDate } from './dates'

const freqText = (rule, t) => {
  if (rule.frequency === 'weekly') return t('ledger.recurring.sumWeekly', { weekday: t(`date.weekday.${weekdayOf(rule.startDate)}`) })
  if (rule.frequency === 'monthly') return rule.dayOfMonth === 0 ? t('ledger.recurring.sumMonthEnd') : t('ledger.recurring.sumMonthly', { n: rule.dayOfMonth ?? Number(rule.startDate.slice(8)) })
  if (rule.frequency === 'yearly') return t('ledger.recurring.sumYearly', { date: shortDate(rule.startDate) })
  return t('ledger.recurring.sumDaily')
}

const Section = ({ transfer }) => {
  const { accounts, recurringRules } = useLedger()
  const { t, fmt } = useI18n()
  const [sheet, setSheet] = useState(null) // null | { rule? }
  const today = todayStr()
  const list = recurringRules.filter((r) => (r.kind === 'transfer') === transfer)
  const accountOf = (id) => accounts.find((a) => a.id === id)

  const nextDate = (rule) => (rule.enabled === false ? null : scheduledDates(rule, { after: rule.generatedThrough ?? addDays(rule.startDate, -1), upTo: addDays(today, 800), limit: 1 })[0] ?? null)

  return (
    <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cs-text)' }}>{t(transfer ? 'ledger.recurring.titleTransfer' : 'ledger.recurring.titleEntry')}</div>
        <button onClick={() => setSheet({})} aria-label={t(transfer ? 'ledger.recurring.newTransfer' : 'ledger.recurring.newEntry')} style={{ background: 'none', border: '1px solid var(--cs-border)', borderRadius: '50%', width: 30, height: 30, display: 'grid', placeItems: 'center', color: 'var(--cs-text)', cursor: 'pointer' }}><Plus size={16} /></button>
      </div>
      {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--cs-text-mute)', padding: '8px 0' }}>{t(transfer ? 'ledger.recurring.emptyTransfer' : 'ledger.recurring.emptyEntry')}</div>}
      {list.map((r) => {
        const account = accountOf(r.accountId)
        const next = nextDate(r)
        const sign = r.kind === 'income' ? '+' : r.kind === 'expense' ? '−' : ''
        return (
          <button key={r.id} onClick={() => setSheet({ rule: r })} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', background: 'none', border: 'none', borderTop: '0.5px solid var(--cs-border)', textAlign: 'left', cursor: 'pointer', color: 'var(--cs-text)', opacity: r.enabled === false ? 0.55 : 1 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-sub)', marginTop: 2 }}>
                {[freqText(r, t), transfer ? `${account?.name ?? ''} → ${accountOf(r.toAccountId)?.name ?? ''}` : account?.name, r.enabled === false ? t('ledger.recurring.disabled') : next ? t('ledger.recurring.next', { date: shortDate(next) }) : t('ledger.recurring.ended')].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{sign}{fmt.money(r.amount, account?.currency ?? 'TWD')}</span>
          </button>
        )
      })}
      {sheet && <RecurringSheet key={sheet.rule?.id ?? 'new'} transfer={transfer} rule={sheet.rule} onClose={() => setSheet(null)} />}
    </div>
  )
}

const LedgerRecurringSettings = () => {
  const { t } = useI18n()
  return (
    <>
      <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.7 }}>{t('ledger.recurring.hint')}</div>
      <Section transfer={false} />
      <Section transfer />
    </>
  )
}

export default LedgerRecurringSettings
