// 預算進度列：名稱、已用／預算、進度條（依等級變色）、剩餘或超支金額。status 是 budget.js 的 budgetStatus 結果
import { useI18n } from '../../i18n/I18nProvider'

const COLORS = { ok: 'var(--cs-info)', warn: 'var(--cs-warn)', over: 'var(--cs-danger)' }

const BudgetRow = ({ name, status, currency, strong = false }) => {
  const { t, fmt } = useI18n()
  return (
    <div data-budget-level={status.level} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
        <span style={{ color: 'var(--cs-text)', fontWeight: strong ? 600 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ color: 'var(--cs-text-sub)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {t('ledger.stats.budgetUsed', { spent: fmt.num(status.spent), amount: fmt.money(status.amount, currency) })}
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--cs-soft)', borderRadius: 3 }}>
        <div style={{ width: `${Math.max(0, Math.min(status.ratio, 1)) * 100}%`, height: '100%', background: COLORS[status.level], borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11.5, textAlign: 'right', color: status.level === 'over' ? 'var(--cs-danger)' : 'var(--cs-text-mute)' }}>
        {status.remaining < 0 ? t('ledger.stats.budgetOver', { amount: fmt.money(-status.remaining, currency) }) : t('ledger.stats.budgetLeft', { amount: fmt.money(status.remaining, currency) })}
      </div>
    </div>
  )
}

export default BudgetRow
