// /group/:id/stats — 群組統計：總覽，下方分「圖表」（類別佔比、每月趨勢）與「帳戶」（付款方式、每人付款總額）兩個分頁。
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, getDoc, getDocs } from 'firebase/firestore'
import { BarChart3 } from 'lucide-react'
import { db } from '../config/firebase'
import Avatar from '../components/Avatar'
import GroupTabBar from '../components/GroupTabBar'
import { useI18n } from '../i18n/I18nProvider'
import { normalizeCategory, categoryLabel } from '../i18n/codes'
import DonutChart from '../components/DonutChart'
import { CATEGORY_COLORS } from '../config/chartColors'
import { sumBySpendMethod, spendTypeLabel } from '../utils/spendMethods'

const TREND_MONTHS = 12

const tabButton = (active) => ({
  flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${active ? 'var(--cs-rc-stamp)' : 'transparent'}`, background: 'none',
  fontSize: 14, fontWeight: active ? 600 : 400, color: active ? 'var(--cs-text)' : 'var(--cs-text-sub)', cursor: 'pointer',
})

const cardStyle = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 16 }
const titleStyle = { fontSize: 13, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 12 }

const MONTH_KEYS = ['stats.month.1', 'stats.month.2', 'stats.month.3', 'stats.month.4', 'stats.month.5', 'stats.month.6', 'stats.month.7', 'stats.month.8', 'stats.month.9', 'stats.month.10', 'stats.month.11', 'stats.month.12']

const StatsPage = () => {
  const { t, fmt: i18nFmt } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState(null)
  const [incomes, setIncomes] = useState([])
  const [tab, setTab] = useState('charts')

  useEffect(() => {
    const fetchData = async () => {
      const [groupSnap, expSnap, incSnap] = await Promise.all([
        getDoc(doc(db, 'groups', id)),
        getDocs(collection(db, 'groups', id, 'expenses')),
        getDocs(collection(db, 'groups', id, 'incomes')),
      ])
      if (!groupSnap.exists()) return
      setGroup({ id: groupSnap.id, ...groupSnap.data() })
      setIncomes(incSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !i.isSponsorship)) // 贊助不算收入
      setExpenses(expSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    fetchData()
  }, [id])

  const stats = useMemo(() => {
    if (!expenses) return null
    const total = expenses.reduce((s, e) => s + e.amount, 0)

    const byCategory = {}
    const byPayer = {}
    const byMonth = {}
    expenses.forEach(e => {
      const cat = normalizeCategory(e.category)
      byCategory[cat] = (byCategory[cat] || 0) + e.amount
      Object.entries(e.payments || {}).forEach(([uid, amt]) => {
        byPayer[uid] = (byPayer[uid] || 0) + amt
      })
      const d = e.createdAt?.toDate?.()
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        byMonth[key] = (byMonth[key] || 0) + e.amount
      }
    })

    const categories = Object.entries(byCategory)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
    const payers = Object.entries(byPayer)
      .map(([uid, amount]) => ({ uid, amount }))
      .sort((a, b) => b.amount - a.amount)

    // 範圍：最早到最晚有帳目的月份（無帳目時只顯示本月），超過上限時取最近的 TREND_MONTHS 個月
    const toIndex = (key) => { const [y, m] = key.split('-').map(Number); return y * 12 + m - 1 }
    const keys = Object.keys(byMonth).map(toIndex)
    const now = new Date()
    const last = keys.length ? Math.max(...keys) : now.getFullYear() * 12 + now.getMonth()
    const first = keys.length ? Math.max(Math.min(...keys), last - TREND_MONTHS + 1) : last
    const months = Array.from({ length: last - first + 1 }, (_, i) => {
      const idx = first + i
      const d = new Date(Math.floor(idx / 12), idx % 12, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return { key, label: MONTH_KEYS[d.getMonth()], amount: byMonth[key] || 0 }
    })

    const methods = sumBySpendMethod(expenses)

    return { total, categories, payers, months, methods }
  }, [expenses])

  if (!group || !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cs-bg)', color: 'var(--cs-text-sub)' }}>
        {t('common.loading')}
      </div>
    )
  }

  const baseCode = group.baseCurrency || 'TWD'
  const fmt = (n) => i18nFmt.money(n, baseCode)
  const count = expenses.length
  const incomeTotal = incomes.reduce((s, i) => s + i.amount, 0)
  const balance = incomeTotal - stats.total
  const statCard = (items) => (
    <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
      {items.map(item => (
        <div key={item.label}>
          <div style={{ fontSize: 11, color: 'var(--cs-text-sub)', marginBottom: 4 }}>{item.label}</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: item.color || 'var(--cs-rc-owe)' }}>{item.value}</div>
        </div>
      ))}
    </div>
  )
  const incomeItem = { label: t('stats.totalIncome'), value: fmt(incomeTotal), color: 'var(--cs-info)' }
  // 結餘（收入 − 支出）：標籤與金額同一行置中，負數轉紅
  const balanceCard = (
    <div style={{ ...cardStyle, display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontSize: 14, color: 'var(--cs-text-sub)' }}>{t('stats.balance')}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: balance < 0 ? 'var(--cs-danger)' : 'var(--cs-info)' }}>{fmt(balance)}</span>
    </div>
  )
  const maxMonth = Math.max(...stats.months.map(m => m.amount), 1)
  const maxPayer = stats.payers[0]?.amount || 1

  // 甜甜圈：以 pathLength=100 讓 dasharray 直接使用百分比
  const pcts = stats.categories.map(c => (stats.total > 0 ? (c.amount / stats.total) * 100 : 0))
  const segments = stats.categories.map((c, i) => ({
    ...c,
    pct: pcts[i],
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    offset: pcts.slice(0, i).reduce((s, p) => s + p, 0),
  }))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 80 }}>

      {/* Header */}
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >‹</button>
          <div style={{ flex: 1, color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('stats.title')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {count === 0 ? (
          <>
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><BarChart3 size={48} color="var(--cs-line-soft)" /></div>
              <div style={{ color: 'var(--cs-text-sub)', fontSize: 14 }}>{t('stats.empty')}</div>
            </div>
            {incomes.length > 0 && balanceCard}
          </>
        ) : (
          <>
            {/* 總覽：有收入時第一排為 總收入／筆數／總支出，下面另起一張結餘 */}
            {incomes.length > 0 ? (
              <>
                {statCard([incomeItem, { label: t('stats.count'), value: count }, { label: t('group.totalExpense'), value: fmt(stats.total) }])}
                {balanceCard}
              </>
            ) : statCard([
              { label: t('group.totalExpense'), value: fmt(stats.total) },
              { label: t('stats.count'), value: count },
            ])}

            {/* 分頁：圖表（類別佔比、每月趨勢）／帳戶（付款方式、每人付款總額）；兩個面板都保持掛載、只切換顯示 */}
            <div role="tablist" style={{ display: 'flex', borderBottom: '0.5px solid var(--cs-border)' }}>
              {['charts', 'accounts'].map((key) => (
                <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} style={tabButton(tab === key)}>
                  {t(`stats.tab.${key}`)}
                </button>
              ))}
            </div>

            <div role="tabpanel" style={{ display: tab === 'charts' ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}>
            {/* 類別佔比 */}
            <div style={cardStyle}>
              <div style={titleStyle}>{t('stats.byCategory')}</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <DonutChart segments={segments.map(s => ({ key: s.name, color: s.color, pct: s.pct }))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {segments.map(s => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{categoryLabel(s.name, t)}</span>
                    <span style={{ color: 'var(--cs-text-sub)', flexShrink: 0 }}>{s.pct.toFixed(1)}%</span>
                    <span style={{ color: 'var(--cs-text)', fontWeight: 500, minWidth: 80, textAlign: 'right', flexShrink: 0 }}>{fmt(s.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 每月趨勢 */}
            <div style={cardStyle}>
              <div style={titleStyle}>{t('stats.trend')}</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
                {stats.months.map(m => (
                  <div key={m.key} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--cs-text-sub)', marginBottom: 4, whiteSpace: 'nowrap' }}>
                      {m.amount > 0 ? i18nFmt.amount(m.amount, baseCode) : ''}
                    </div>
                    <div style={{ width: '100%', maxWidth: 32, height: `${(m.amount / maxMonth) * 100}%`, minHeight: m.amount > 0 ? 3 : 0, background: 'var(--cs-rc-stamp)', borderRadius: '6px 6px 0 0' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, borderTop: '0.5px solid var(--cs-border)', paddingTop: 6, marginTop: 0 }}>
                {stats.months.map(m => (
                  <div key={m.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--cs-text-sub)' }}>{t(m.label)}</div>
                ))}
              </div>
            </div>

            </div>

            <div role="tabpanel" style={{ display: tab === 'accounts' ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}>
            {/* 付款方式 */}
            <div style={cardStyle}>
              <div style={titleStyle}>{t('stats.byMethod')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.methods.map(m => (
                  <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ flex: 1, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{spendTypeLabel(m.name, t)}</span>
                    <span style={{ color: 'var(--cs-text-sub)', flexShrink: 0 }}>{stats.total > 0 ? ((m.amount / stats.total) * 100).toFixed(1) : '0.0'}%</span>
                    <span style={{ color: 'var(--cs-text)', fontWeight: 500, minWidth: 80, textAlign: 'right', flexShrink: 0 }}>{fmt(m.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 每人付款 */}
            <div style={cardStyle}>
              <div style={titleStyle}>{t('stats.byPayer')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stats.payers.map(p => {
                  const profile = group.memberProfiles?.[p.uid]
                  return (
                    <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar src={profile?.avatar} name={profile?.name} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.name || t('payer.unknown')}</span>
                          <span style={{ color: 'var(--cs-text)', fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>{fmt(p.amount)}</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--cs-soft)', borderRadius: 3 }}>
                          <div style={{ width: `${(p.amount / maxPayer) * 100}%`, height: '100%', background: 'var(--cs-rc-stamp)', borderRadius: 3 }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            </div>
          </>
        )}
      </div>

      <GroupTabBar groupId={id} active="stats" />
    </div>
  )
}

export default StatsPage
