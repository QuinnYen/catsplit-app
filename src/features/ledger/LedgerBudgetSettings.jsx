// 設定的「預算」內頁：月預算總額、年預算總額（帳本文件），以及各支出類別的月預算（類別文件的 budget）。
// 統計幣別、只算支出；輸入框離開時儲存，空白是取消預算。
import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from './LedgerContext'
import { updateLedgerBudget, applyCategoryChange } from './data'
import { parseBudgetInput } from './budget'

const inputStyle = { width: 120, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '8px 10px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-bg)', outline: 'none', textAlign: 'right' }

// 輸入框：離開時才儲存；值沒變不寫入；無效的值提示並還原
const BudgetInput = ({ label, value, onSave }) => {
  const { t } = useI18n()
  const [text, setText] = useState(String(value ?? '')) // 外面的值變了就換 key 重新建立
  const commit = async () => {
    const parsed = parseBudgetInput(text)
    if (parsed === undefined) { setText(String(value ?? '')); return onSave(undefined) }
    if (parsed === (value ?? null)) return
    await onSave(parsed)
  }
  return (
    <input
      value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      inputMode="decimal" aria-label={label} placeholder={t('ledger.budget.none')} style={inputStyle}
    />
  )
}

const LedgerBudgetSettings = () => {
  const { uid, ledger, categories, categoryDocs, catName, showToast } = useLedger()
  const { t } = useI18n()
  const base = ledger.baseCurrency

  const guard = async (fn) => {
    try {
      await fn()
      showToast(t('ledger.edit.saved'))
    } catch (e) {
      console.error('Failed to save budget', e)
      showToast(t('ledger.edit.failed'))
    }
  }
  const saveLedger = (field) => (amount) => (amount === undefined ? showToast(t('ledger.budget.invalid')) : guard(() => updateLedgerBudget(uid, ledger.id, { [field]: amount })))
  const saveCategory = (key) => (amount) => (amount === undefined
    ? showToast(t('ledger.budget.invalid'))
    : guard(async () => { await applyCategoryChange(uid, ledger.id, categoryDocs, { type: 'budget', kind: 'expense', key, amount }, catName) }))

  const row = (id, name, input) => (
    <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTop: '0.5px solid var(--cs-border)', minHeight: 48 }}>
      <span style={{ fontSize: 14, color: 'var(--cs-text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {input}
    </div>
  )

  return (
    <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: '12px 14px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cs-text)' }}>{t('ledger.budget.title')}</div>
      <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.6, margin: '4px 0 6px' }}>{t('ledger.budget.desc', { currency: base })}</div>
      {row('m', t('ledger.budget.month'), <BudgetInput key={`m:${ledger.monthBudget ?? ''}`} label={t('ledger.budget.month')} value={ledger.monthBudget} onSave={saveLedger('monthBudget')} />)}
      {row('y', t('ledger.budget.year'), <BudgetInput key={`y:${ledger.yearBudget ?? ''}`} label={t('ledger.budget.year')} value={ledger.yearBudget} onSave={saveLedger('yearBudget')} />)}
      <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', margin: '14px 0 4px' }}>{t('ledger.budget.byCategory')}</div>
      {categories.expense.map((c) => row(c.key, catName('expense', c.key), <BudgetInput key={`${c.key}:${c.budget ?? ''}`} label={t('ledger.budget.categoryOf', { name: catName('expense', c.key) })} value={c.budget} onSave={saveCategory(c.key)} />))}
    </div>
  )
}

export default LedgerBudgetSettings
