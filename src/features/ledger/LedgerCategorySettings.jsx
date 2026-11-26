// 設定的「類別」內頁：支出類別與收入類別（每個帳本各一份），用「支出／收入」切換。新增、改名、上移下移、刪除。
// 刪除的類別，舊帳目顯示為「其他」；每種至少保留一個。沒有編輯過的帳本用預設清單，第一次編輯才寫入。
import { useState } from 'react'
import { ChevronUp, ChevronDown, Pencil, Trash2, Check } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { useLedger } from './LedgerContext'
import { applyCategoryChange } from './data'
import { CATEGORY_NAME_MAX } from './categories'

const iconBtn = (disabled) => ({ background: 'none', border: 'none', padding: 6, display: 'flex', color: 'var(--cs-text-sub)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.3 : 1 })
const inputStyle = { flex: 1, minWidth: 0, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '8px 10px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-bg)', outline: 'none' }

const Section = ({ kind }) => {
  const { uid, ledger, categories, categoryDocs, catName, showToast } = useLedger()
  const { t } = useI18n()
  const list = categories[kind]
  const [editing, setEditing] = useState(null) // { key, name }
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (change) => {
    setBusy(true)
    try {
      const r = await applyCategoryChange(uid, ledger.id, categoryDocs, { ...change, kind }, catName)
      if (r.error) showToast(t(`ledger.cat.err.${r.error}`, { max: CATEGORY_NAME_MAX }))
      return !r.error
    } catch (e) {
      console.error('Failed to change category', e)
      showToast(t('ledger.edit.failed'))
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async () => { if (await run({ type: 'add', name: newName })) setNewName('') }
  const rename = async () => { if (await run({ type: 'rename', key: editing.key, name: editing.name })) setEditing(null) }
  const remove = (c) => {
    if (window.confirm(t('ledger.cat.deleteConfirm', { name: catName(kind, c.key) }))) run({ type: 'delete', key: c.key })
  }

  return (
    <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: '12px 14px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cs-text)', marginBottom: 6 }}>{t(kind === 'income' ? 'ledger.cat.income' : 'ledger.cat.expense')}</div>
      {list.map((c, i) => (
        <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 2, borderTop: '0.5px solid var(--cs-border)', minHeight: 44 }}>
          {editing?.key === c.key ? (
            <>
              <input
                value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={CATEGORY_NAME_MAX} autoFocus
                aria-label={t('ledger.cat.name')} style={inputStyle}
                onKeyDown={(e) => { if (e.key === 'Enter') rename() }}
              />
              <button onClick={rename} disabled={busy} aria-label={t('common.save')} style={iconBtn(busy)}><Check size={18} /></button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{catName(kind, c.key)}</span>
              <button onClick={() => run({ type: 'move', key: c.key, dir: -1 })} disabled={busy || i === 0} aria-label={t('ledger.cat.up', { name: catName(kind, c.key) })} style={iconBtn(busy || i === 0)}><ChevronUp size={18} /></button>
              <button onClick={() => run({ type: 'move', key: c.key, dir: 1 })} disabled={busy || i === list.length - 1} aria-label={t('ledger.cat.down', { name: catName(kind, c.key) })} style={iconBtn(busy || i === list.length - 1)}><ChevronDown size={18} /></button>
              <button onClick={() => setEditing({ key: c.key, name: catName(kind, c.key) })} disabled={busy} aria-label={t('ledger.cat.rename', { name: catName(kind, c.key) })} style={iconBtn(busy)}><Pencil size={16} /></button>
              <button onClick={() => remove(c)} disabled={busy || list.length <= 1} aria-label={t('ledger.cat.delete', { name: catName(kind, c.key) })} style={{ ...iconBtn(busy || list.length <= 1), color: 'var(--cs-danger)' }}><Trash2 size={16} /></button>
            </>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, borderTop: '0.5px solid var(--cs-border)', paddingTop: 10, marginTop: 2 }}>
        <input
          value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={CATEGORY_NAME_MAX} placeholder={t('ledger.cat.newPlaceholder')}
          aria-label={t(kind === 'income' ? 'ledger.cat.newIncome' : 'ledger.cat.newExpense')} style={inputStyle}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
        />
        <button onClick={add} disabled={busy || !newName.trim()} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: busy || !newName.trim() ? 'not-allowed' : 'pointer', opacity: !newName.trim() ? 0.5 : 1 }}>
          {t('ledger.cat.add')}
        </button>
      </div>
    </div>
  )
}

const LedgerCategorySettings = () => {
  const { t } = useI18n()
  const [kind, setKind] = useState('expense')
  return (
    <>
      <div role="tablist" style={{ display: 'flex', background: 'var(--cs-card)', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: 3, gap: 3 }}>
        {['expense', 'income'].map((k) => (
          <button
            key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: kind === k ? 600 : 400, cursor: 'pointer', background: kind === k ? 'var(--cs-rc-stamp)' : 'transparent', color: kind === k ? 'var(--cs-rc-stamp-text)' : 'var(--cs-text-sub)' }}
          >
            {t(`kind.${k}`)}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.7 }}>{t('ledger.cat.hint')}</div>
      <Section key={kind} kind={kind} />
    </>
  )
}

export default LedgerCategorySettings
