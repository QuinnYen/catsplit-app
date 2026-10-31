// 群組頁的全螢幕搜尋：搜尋框加類別篩選，結果只含支出（標題、備註、類別、付款人、金額），點結果開明細。
import { useState } from 'react'
import { ChevronRight, Search, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { categoryLabel, normalizeCategory } from '../i18n/codes'
import { getCurrency } from '../config/currencies'
import { matchExpense, payerLabel } from '../utils/expenseHelpers'

const SearchOverlay = ({ group, expenses, onClose, onOpenExpense }) => {
  const { t, fmt } = useI18n()
  const [text, setText] = useState('')
  const [category, setCategory] = useState(null)
  const baseCurrency = group.baseCurrency || 'TWD'

  const cats = Array.from(new Set(expenses.map(e => normalizeCategory(e.category))))
  const hasCondition = text.trim() !== '' || category !== null
  const results = hasCondition
    ? expenses
        .filter(e =>
          (!category || normalizeCategory(e.category) === category) &&
          matchExpense(e, text, group.memberProfiles, categoryLabel(e.category, t)))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    : []

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#fff8f4', display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

        {/* 搜尋列 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '0.5px solid #f0d5c0', borderRadius: 20, padding: '8px 12px' }}>
            <Search size={16} color="#b08060" style={{ flexShrink: 0 }} />
            <input
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && onClose()}
              placeholder={t('group.searchPlaceholder')}
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: '#3d2b1f' }}
            />
            {text && (
              <button
                onClick={() => setText('')}
                aria-label={t('group.searchClear')}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#b08060', display: 'flex', flexShrink: 0 }}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 14, color: '#FF8C42', fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}
          >
            {t('common.cancel')}
          </button>
        </div>

        {/* 類別篩選 */}
        {cats.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 16px 10px', scrollbarWidth: 'none', flexShrink: 0 }}>
            {[null, ...cats].map(cat => {
              const isActive = category === cat
              return (
                <button
                  key={cat ?? 'all'}
                  onClick={() => setCategory(cat)}
                  style={{
                    flexShrink: 0, padding: '5px 12px', borderRadius: 20, fontSize: 12, border: 'none', cursor: 'pointer',
                    background: isActive ? '#FF8C42' : '#fff3ec',
                    color: isActive ? '#fff' : '#b08060',
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {cat === null ? t('group.filterAll') : categoryLabel(cat, t)}
                </button>
              )
            })}
          </div>
        )}

        {/* 結果 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
          {!hasCondition && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#c4a882', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Search size={40} color="#e0c4b0" /></div>
              {t('group.searchHint')}
            </div>
          )}

          {hasCondition && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#b08060', fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Search size={40} color="#e0c4b0" /></div>
              {text.trim() !== '' ? t('group.noMatch') : t('group.noCategoryMatch')}
            </div>
          )}

          {results.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#c4a882', padding: '4px 0 8px' }}>{t('group.searchCount', { n: results.length })}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map(item => {
                  const date = item.createdAt?.toDate ? fmt.date(item.createdAt.toDate()) : t('group.unknownDate')
                  const hasFx = item.currency && item.currency !== baseCurrency
                  return (
                    <div
                      key={item.id}
                      onClick={() => onOpenExpense(item.id)}
                      style={{ background: '#fff', borderRadius: 14, border: '0.5px solid #f0d5c0', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: '#FF6B1A', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {categoryLabel(item.category, t)}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#b08060', display: 'flex' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {payerLabel(item.payments, group.memberProfiles, t)}
                          </span>
                          <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>&nbsp;{t('group.paidSuffix')} · {date}</span>
                        </div>
                        {item.note && (
                          <div style={{ fontSize: 11, color: '#c4a882', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.note}</div>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ fontSize: 15, fontWeight: 500, color: '#FF6B1A' }}>
                          {getCurrency(item.currency || baseCurrency).symbol} {fmt.num(item.originalAmount ?? item.amount)}
                        </div>
                        {hasFx && (
                          <div style={{ fontSize: 11, color: '#c4a882', marginTop: 1 }}>
                            ≈ {getCurrency(baseCurrency).symbol} {fmt.num(item.amount)}
                          </div>
                        )}
                      </div>
                      <ChevronRight size={16} color="#c4a882" style={{ flexShrink: 0 }} />
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SearchOverlay
