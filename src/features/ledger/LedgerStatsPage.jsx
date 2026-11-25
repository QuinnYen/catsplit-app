// /ledger/stats — 圖表：選定月份的分類占比，以及近 6 個月的收支趨勢。只加總 baseAmount（帳本統計幣別）。
// 選定月份沿用即時訂閱，前 5 個月各讀一次（見 hooks.js 的 useMonthsOnce），不另外建彙總資料。
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { categoryLabel } from '../../i18n/codes'
import { CATEGORY_COLORS } from '../../config/chartColors'
import DonutChart from '../../components/DonutChart'
import MonthPicker from '../../components/MonthPicker'
import { useLedger } from './LedgerContext'
import { useMonthTransactions, useMonthsOnce } from './hooks'
import { todayStr, monthKeyOf, shiftMonthDate, dateForMonth, shortDate, periodSettings, periodBounds, periodLastDay } from './dates'
import { summarizeEntries, sumByCategory, lastMonths, trendByMonth } from './summary'

const TREND_MONTHS = 6
const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 16 }
const title = { fontSize: 13, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 12 }
const navBtn = { background: 'none', border: 'none', color: 'inherit', fontSize: 22, lineHeight: 1, padding: '0 10px', cursor: 'pointer' }

const LedgerStatsPage = () => {
  const { uid, ledger, selectedDate, setSelectedDate } = useLedger()
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const base = ledger.baseCurrency
  const { monthStartDay } = periodSettings(ledger)
  const monthKey = monthKeyOf(selectedDate, monthStartDay)
  const [year, month] = monthKey.split('-').map(Number)
  const [type, setType] = useState('expense')
  const [pickerOpen, setPickerOpen] = useState(false)

  const live = useMonthTransactions(uid, ledger.id, monthKey, monthStartDay)
  const keys = lastMonths(monthKey, TREND_MONTHS)
  const loaded = useMonthsOnce(uid, ledger.id, keys, monthKey, monthStartDay)
  const loading = live === null || keys.some((k) => k !== monthKey && !loaded[k])

  const totals = summarizeEntries(live ?? [])
  const categories = sumByCategory(live ?? [], type)
  const trend = trendByMonth({ ...loaded, [monthKey]: live ?? [] }, keys)

  const typeTotal = type === 'expense' ? totals.expense : totals.income
  const segments = categories.map((c, i) => ({ ...c, key: c.category, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], pct: c.ratio * 100 }))
  const maxBar = Math.max(...trend.map((m) => m[type]), 1)

  const tabBtn = (active) => ({ flex: 1, padding: '9px 0', border: 'none', borderBottom: `2px solid ${active ? 'var(--cs-rc-stamp)' : 'transparent'}`, background: 'none', fontSize: 14, fontWeight: active ? 600 : 400, color: active ? 'var(--cs-text)' : 'var(--cs-text-sub)', cursor: 'pointer' })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', color: 'var(--cs-rc-head-text)', padding: '14px 16px 18px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={() => navigate('/ledger')} aria-label={t('ledger.tab.book')} style={{ ...navBtn, fontSize: 26, padding: 0, width: 32 }}>‹</button>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => setSelectedDate(shiftMonthDate(selectedDate, -1, todayStr(), monthStartDay))} aria-label={t('month.prev')} style={navBtn}>‹</button>
            <button onClick={() => setPickerOpen(true)} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 15, fontWeight: 600, padding: '4px 6px', cursor: 'pointer' }}>
              {t('ledger.month.label', { year, month })} ▾
            </button>
            <button onClick={() => setSelectedDate(shiftMonthDate(selectedDate, 1, todayStr(), monthStartDay))} aria-label={t('month.next')} style={navBtn}>›</button>
          </div>
          <span style={{ width: 32 }} />
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.75, marginTop: 6 }}>{monthStartDay !== 1 && `${shortDate(periodBounds(monthKey, monthStartDay).start)}–${shortDate(periodLastDay(monthKey, monthStartDay))} · `}{ledger.name} · {t('ledger.baseCaption', { currency: base })}</div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...card, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
          {[['kind.expense', totals.expense, 'var(--cs-rc-owe)'], ['kind.income', totals.income, 'var(--cs-info)'], ['ledger.stat.balance', totals.balance, totals.balance < 0 ? 'var(--cs-danger)' : 'var(--cs-text)']].map(([k, v, color]) => (
            <div key={k}>
              <div style={{ fontSize: 11, color: 'var(--cs-text-sub)', marginBottom: 4 }}>{t(k)}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color }}>{fmt.money(v, base)}</div>
            </div>
          ))}
        </div>

        <div role="tablist" style={{ display: 'flex', borderBottom: '0.5px solid var(--cs-border)' }}>
          {['expense', 'income'].map((k) => (
            <button key={k} role="tab" aria-selected={type === k} onClick={() => setType(k)} style={tabBtn(type === k)}>{t(`kind.${k}`)}</button>
          ))}
        </div>

        {loading && <div style={{ textAlign: 'center', color: 'var(--cs-text-sub)', fontSize: 13 }}>{t('common.loading')}</div>}

        <div style={card}>
          <div style={title}>{t('ledger.stats.byCategory')}</div>
          {segments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--cs-text-mute)', fontSize: 13 }}>
              <BarChart3 size={36} color="var(--cs-line-soft)" style={{ display: 'block', margin: '0 auto 8px' }} />
              {t(type === 'expense' ? 'ledger.stats.emptyExpense' : 'ledger.stats.emptyIncome')}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><DonutChart segments={segments} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {segments.map((s) => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{categoryLabel(s.category, t)}</span>
                    <span style={{ color: 'var(--cs-text-sub)', flexShrink: 0 }}>{s.pct.toFixed(1)}%</span>
                    <span style={{ color: 'var(--cs-text)', fontWeight: 500, minWidth: 80, textAlign: 'right', flexShrink: 0 }}>{fmt.money(s.total, base)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '0.5px solid var(--cs-border)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--cs-text-sub)' }}>
                <span>{t('ledger.stats.total')}</span>
                <span style={{ color: 'var(--cs-text)', fontWeight: 600 }}>{fmt.money(typeTotal, base)}</span>
              </div>
            </>
          )}
        </div>

        <div style={card}>
          <div style={title}>{t('ledger.stats.trend', { n: TREND_MONTHS })}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
            {trend.map((m) => (
              <div key={m.key} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', minWidth: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--cs-text-sub)', marginBottom: 4, whiteSpace: 'nowrap' }}>{m[type] > 0 ? fmt.amount(m[type], base) : ''}</div>
                <div data-month={m.key} style={{ width: '100%', maxWidth: 32, height: `${(m[type] / maxBar) * 100}%`, minHeight: m[type] > 0 ? 3 : 0, background: m.key === monthKey ? 'var(--cs-rc-stamp)' : 'var(--cs-line-soft)', borderRadius: '6px 6px 0 0' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, borderTop: '0.5px solid var(--cs-border)', paddingTop: 6 }}>
            {trend.map((m) => (
              <div key={m.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: m.key === monthKey ? 'var(--cs-text)' : 'var(--cs-text-sub)' }}>{t(`stats.month.${Number(m.key.slice(5))}`)}</div>
            ))}
          </div>
        </div>
      </div>

      {pickerOpen && <MonthPicker value={monthKey} onPick={(key) => { setPickerOpen(false); setSelectedDate(dateForMonth(key, todayStr(), monthStartDay)) }} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}

export default LedgerStatsPage
