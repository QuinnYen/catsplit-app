// 設定頁「基本」分頁：固定收支與轉帳、預算、類別三個入口，點進去是各自的獨立內頁（LedgerSettingsSubPage）。
// 右側摘要用現有資料算，不多讀資料。
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from './LedgerContext'

const LedgerSettingsMenu = () => {
  const { ledger, recurringRules, categories } = useLedger()
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const base = ledger.baseCurrency

  const budgetSummary = ledger.monthBudget
    ? t('ledger.set.monthBudget', { amount: fmt.money(ledger.monthBudget, base) })
    : ledger.yearBudget ? t('ledger.set.yearBudget', { amount: fmt.money(ledger.yearBudget, base) }) : t('ledger.set.none')
  const rows = [
    { to: 'recurring', label: t('ledger.set.recurring'), summary: recurringRules.length ? t('ledger.set.recurringCount', { n: recurringRules.length }) : t('ledger.set.none') },
    { to: 'budget', label: t('ledger.set.budget'), summary: budgetSummary },
    { to: 'categories', label: t('ledger.set.categories'), summary: t('ledger.set.categoryCount', { e: categories.expense.length, i: categories.income.length }) },
  ]

  return (
    <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: '0 14px' }}>
      {rows.map((r, i) => (
        <button
          key={r.to}
          onClick={() => navigate(`/ledger/settings/${r.to}`)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid var(--cs-border)', textAlign: 'left', cursor: 'pointer', color: 'var(--cs-text)', WebkitTapHighlightColor: 'transparent' }}
        >
          <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{r.label}</span>
          <span style={{ fontSize: 12.5, color: 'var(--cs-text-sub)', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{r.summary}</span>
          <ChevronRight size={18} color="var(--cs-text-mute)" style={{ flexShrink: 0 }} />
        </button>
      ))}
    </div>
  )
}

export default LedgerSettingsMenu
