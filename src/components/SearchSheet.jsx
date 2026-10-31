// 群組頁的搜尋條件選單（底部彈出）：日期、類型、類別、貨幣、搜尋文字、範圍。按「搜尋」後把條件交回群組頁，直接篩選原列表。
import { useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { categoryLabel } from '../i18n/codes'
import { EMPTY_FILTERS } from '../utils/searchFilter'

const RANGES = [
  ['all', 'search.range.all'], ['thisMonth', 'search.range.thisMonth'], ['lastMonth', 'search.range.lastMonth'],
  ['thisYear', 'search.range.thisYear'], ['lastYear', 'search.range.lastYear'], ['custom', 'search.range.custom'],
]
const TYPES = [
  ['all', 'group.filterAll'], ['expense', 'kind.expense'], ['income', 'kind.income'], ['settlement', 'search.type.settlement'],
]

const sectionTitle = { fontSize: 13, fontWeight: 600, color: '#3d2b1f', margin: '16px 0 8px' }
const dateInput = { flex: 1, minWidth: 0, border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '8px 10px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }

const Chip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      flexShrink: 0, padding: '6px 13px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
      border: active ? '1px solid #FF8C42' : '1px solid #f0d5c0',
      background: active ? '#fff3ec' : '#fff', color: active ? '#FF6B1A' : '#8a6a52', fontWeight: active ? 600 : 400,
    }}
  >
    {children}
  </button>
)

const Segmented = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', border: '1px solid #f0d5c0', borderRadius: 10, overflow: 'hidden' }}>
    {options.map(([key, label], i) => (
      <button
        key={String(key)}
        onClick={() => onChange(key)}
        style={{
          flex: 1, padding: '10px 0', fontSize: 13, border: 'none', cursor: 'pointer',
          borderLeft: i === 0 ? 'none' : '1px solid #f0d5c0',
          background: value === key ? '#fff3ec' : '#fff', color: value === key ? '#FF6B1A' : '#8a6a52', fontWeight: value === key ? 600 : 400,
        }}
      >
        {label}
      </button>
    ))}
  </div>
)

const SearchSheet = ({ initial, categories, currencies, onApply, onClose }) => {
  const { t } = useI18n()
  const [f, setF] = useState(initial)
  const patch = (p) => setF(prev => ({ ...prev, ...p }))

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 720, margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 4px' }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#3d2b1f' }}>{t('group.search')}</div>
          <button onClick={onClose} aria-label={t('common.cancel')} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#b08060', display: 'flex' }}>
            <X size={22} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 18px 12px' }}>
          <div style={sectionTitle}>{t('search.date')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {RANGES.map(([key, label]) => <Chip key={key} active={f.range === key} onClick={() => patch({ range: key })}>{t(label)}</Chip>)}
          </div>
          {f.range === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input type="date" value={f.from} onChange={e => patch({ from: e.target.value })} aria-label={t('search.from')} style={dateInput} />
              <span style={{ color: '#b08060' }}>–</span>
              <input type="date" value={f.to} onChange={e => patch({ to: e.target.value })} aria-label={t('search.to')} style={dateInput} />
            </div>
          )}

          <div style={sectionTitle}>{t('search.type')}</div>
          <Segmented options={TYPES.map(([k, l]) => [k, t(l)])} value={f.type} onChange={v => patch({ type: v })} />

          {categories.length > 0 && (
            <>
              <div style={sectionTitle}>{t('search.category')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Chip active={f.category === null} onClick={() => patch({ category: null })}>{t('group.filterAll')}</Chip>
                {categories.map(c => <Chip key={c} active={f.category === c} onClick={() => patch({ category: c })}>{categoryLabel(c, t)}</Chip>)}
              </div>
            </>
          )}

          {currencies.length > 1 && (
            <>
              <div style={sectionTitle}>{t('search.currency')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Chip active={f.currency === null} onClick={() => patch({ currency: null })}>{t('group.filterAll')}</Chip>
                {currencies.map(c => <Chip key={c} active={f.currency === c} onClick={() => patch({ currency: c })}>{c}</Chip>)}
              </div>
            </>
          )}

          <div style={sectionTitle}>{t('search.text')}</div>
          <input
            value={f.text}
            onChange={e => patch({ text: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && onApply(f)}
            placeholder={t('group.searchPlaceholder')}
            style={{ width: '100%', border: '1px solid #f0d5c0', borderRadius: 10, padding: '11px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
          />

          <div style={sectionTitle}>{t('search.scope')}</div>
          <Segmented
            options={[[false, t('search.scope.all')], [true, t('search.scope.mine')]]}
            value={f.mine}
            onChange={v => patch({ mine: v })}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '12px 18px calc(14px + env(safe-area-inset-bottom, 0px))', borderTop: '0.5px solid #f5ece4' }}>
          <button
            onClick={() => setF(EMPTY_FILTERS)}
            style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid #f0d5c0', background: '#fff', color: '#FF8C42', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            {t('search.reset')}
          </button>
          <button
            onClick={() => onApply(f)}
            style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: 'none', background: '#FF8C42', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            {t('group.search')}
          </button>
        </div>
      </div>
    </>
  )
}

export default SearchSheet
