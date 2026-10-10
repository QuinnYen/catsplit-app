// /group/:id/stats — 群組統計：總覽、類別佔比、每月趨勢與每人付款。
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, getDoc, getDocs } from 'firebase/firestore'
import { BarChart3 } from 'lucide-react'
import { db } from '../config/firebase'
import Avatar from '../components/Avatar'
import PawDecor from '../components/PawDecor'
import TabBar from '../components/TabBar'
import { getCurrency } from '../config/currencies'

const CATEGORY_COLORS = ['#FF8C42', '#FFB37A', '#E8703A', '#F5C26B', '#C4A882', '#D98C5F', '#8FBF9F', '#7FA6C9']
const TREND_MONTHS = 6

const cardStyle = { background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 16 }
const titleStyle = { fontSize: 13, fontWeight: 500, color: '#b08060', marginBottom: 12 }

const StatsPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState(null)
  const [incomes, setIncomes] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      const [groupSnap, expSnap, incSnap] = await Promise.all([
        getDoc(doc(db, 'groups', id)),
        getDocs(collection(db, 'groups', id, 'expenses')),
        getDocs(collection(db, 'groups', id, 'incomes')),
      ])
      if (!groupSnap.exists()) return
      setGroup({ id: groupSnap.id, ...groupSnap.data() })
      setIncomes(incSnap.docs.map(d => ({ id: d.id, ...d.data() })))
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
      const cat = e.category || '其他'
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

    const now = new Date()
    const months = Array.from({ length: TREND_MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (TREND_MONTHS - 1 - i), 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return { key, label: `${d.getMonth() + 1}月`, amount: byMonth[key] || 0 }
    })

    return { total, categories, payers, months }
  }, [expenses])

  if (!group || !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        載入中...
      </div>
    )
  }

  const symbol = getCurrency(group.baseCurrency || 'TWD').symbol
  const fmt = (n) => `${symbol} ${Math.round(n).toLocaleString()}`
  const count = expenses.length
  const incomeTotal = incomes.reduce((s, i) => s + i.amount, 0)
  const incomeCard = incomes.length > 0 && (
    <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
      {[
        { label: '總收入', value: fmt(incomeTotal) },
        { label: '淨支出', value: fmt(stats.total - incomeTotal) },
      ].map(item => (
        <div key={item.label}>
          <div style={{ fontSize: 11, color: '#b08060', marginBottom: 4 }}>{item.label}</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1976d2' }}>{item.value}</div>
        </div>
      ))}
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
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <PawDecor />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >‹</button>
          <div style={{ flex: 1, color: '#fff', fontSize: 16, fontWeight: 500 }}>圖表與統計</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {count === 0 ? (
          <>
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><BarChart3 size={48} color="#e0c4b0" /></div>
              <div style={{ color: '#b08060', fontSize: 14 }}>還沒有支出可以統計</div>
            </div>
            {incomeCard}
          </>
        ) : (
          <>
            {/* 總覽 */}
            <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              {[
                { label: '總支出', value: fmt(stats.total) },
                { label: '筆數', value: count },
                { label: '平均每筆', value: fmt(stats.total / count) },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 11, color: '#b08060', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#FF6B1A' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {incomeCard}

            {/* 類別佔比 */}
            <div style={cardStyle}>
              <div style={titleStyle}>類別佔比</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <svg width="160" height="160" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="21" cy="21" r="15.915" fill="none" stroke="#fff3ec" strokeWidth="6" />
                  {segments.map(s => (
                    <circle
                      key={s.name}
                      cx="21" cy="21" r="15.915" fill="none"
                      stroke={s.color} strokeWidth="6" pathLength="100"
                      strokeDasharray={`${s.pct} ${100 - s.pct}`}
                      strokeDashoffset={-s.offset}
                    />
                  ))}
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {segments.map(s => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#3d2b1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span style={{ color: '#b08060', flexShrink: 0 }}>{s.pct.toFixed(1)}%</span>
                    <span style={{ color: '#3d2b1f', fontWeight: 500, minWidth: 80, textAlign: 'right', flexShrink: 0 }}>{fmt(s.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 每月趨勢 */}
            <div style={cardStyle}>
              <div style={titleStyle}>近 {TREND_MONTHS} 個月趨勢</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
                {stats.months.map(m => (
                  <div key={m.key} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: '#b08060', marginBottom: 4, whiteSpace: 'nowrap' }}>
                      {m.amount > 0 ? Math.round(m.amount).toLocaleString() : ''}
                    </div>
                    <div style={{ width: '100%', maxWidth: 32, height: `${(m.amount / maxMonth) * 100}%`, minHeight: m.amount > 0 ? 3 : 0, background: '#FF8C42', borderRadius: '6px 6px 0 0' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, borderTop: '0.5px solid #f0d5c0', paddingTop: 6, marginTop: 0 }}>
                {stats.months.map(m => (
                  <div key={m.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#b08060' }}>{m.label}</div>
                ))}
              </div>
            </div>

            {/* 每人付款 */}
            <div style={cardStyle}>
              <div style={titleStyle}>每人付款總額</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stats.payers.map(p => {
                  const profile = group.memberProfiles?.[p.uid]
                  return (
                    <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar src={profile?.avatar} name={profile?.name} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ color: '#3d2b1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.name || '未知'}</span>
                          <span style={{ color: '#3d2b1f', fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>{fmt(p.amount)}</span>
                        </div>
                        <div style={{ height: 6, background: '#fff3ec', borderRadius: 3 }}>
                          <div style={{ width: `${(p.amount / maxPayer) * 100}%`, height: '100%', background: '#FF8C42', borderRadius: 3 }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <TabBar context="expense" groupId={id} />
    </div>
  )
}

export default StatsPage
