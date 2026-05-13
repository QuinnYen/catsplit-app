import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, getDoc, getDocs } from 'firebase/firestore'
import { db } from '../config/firebase'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'
import { CURRENCIES, getCurrency, fetchExchangeRate } from '../config/currencies'

const SettlePage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)
  const [displayCurrency, setDisplayCurrency] = useState(null) // null = 尚未初始化
  const [displayRate, setDisplayRate] = useState(1)
  const [rateLoading, setRateLoading] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const groupSnap = await getDoc(doc(db, 'groups', id))
      if (!groupSnap.exists()) return
      const groupData = { id: groupSnap.id, ...groupSnap.data() }
      setGroup(groupData)

      const expensesSnap = await getDocs(collection(db, 'groups', id, 'expenses'))
      const expensesData = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setExpenses(expensesData)

      const balance = {}
      groupData.members.forEach(uid => { balance[uid] = 0 })
      expensesData.forEach(expense => {
        balance[expense.paidBy] = (balance[expense.paidBy] || 0) + expense.amount
        Object.entries(expense.splits || {}).forEach(([uid, amt]) => {
          balance[uid] = (balance[uid] || 0) - amt
        })
      })

      const result = []
      const creditors = []
      const debtors = []
      Object.entries(balance).forEach(([uid, amt]) => {
        if (amt > 0.01) creditors.push({ uid, amt })
        else if (amt < -0.01) debtors.push({ uid, amt: -amt })
      })
      creditors.sort((a, b) => b.amt - a.amt)
      debtors.sort((a, b) => b.amt - a.amt)

      let i = 0, j = 0
      while (i < creditors.length && j < debtors.length) {
        const creditor = creditors[i]
        const debtor = debtors[j]
        const amount = Math.min(creditor.amt, debtor.amt)
        if (amount > 0.01) {
          result.push({
            from: debtor.uid,
            to: creditor.uid,
            amount: parseFloat(amount.toFixed(0)),
          })
        }
        creditor.amt -= amount
        debtor.amt -= amount
        if (creditor.amt < 0.01) i++
        if (debtor.amt < 0.01) j++
      }

      setSettlements(result)
      setDisplayCurrency(groupData.baseCurrency || 'TWD')
      setLoading(false)
    }
    fetchData()
  }, [id])

  useEffect(() => {
    if (!displayCurrency || !group) return
    const base = group.baseCurrency || 'TWD'
    if (displayCurrency === base) { setDisplayRate(1); return }
    setRateLoading(true)
    fetchExchangeRate(base, displayCurrency)
      .then(rate => setDisplayRate(rate))
      .catch(() => setDisplayRate(1))
      .finally(() => setRateLoading(false))
  }, [displayCurrency, group?.baseCurrency])

  if (loading || !group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        計算中...
      </div>
    )
  }

  const baseCurrency = group.baseCurrency || 'TWD'
  const dispCurr = getCurrency(displayCurrency || baseCurrency)
  const fmt = (amount) => `${dispCurr.symbol} ${Math.round(amount * displayRate).toLocaleString()}`

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const perPerson = group.members.length > 0 ? total / group.members.length : 0

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', display: 'flex', flexDirection: 'column', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: 10, bottom: -10, fontSize: 64, opacity: 0.12, userSelect: 'none' }}>🐾</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ‹
          </button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>結算</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 總覽卡片 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 28 }}>{group.emoji}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#3d2b1f' }}>{group.name}</div>
              <div style={{ fontSize: 12, color: '#b08060' }}>{group.members.length} 位成員 · {expenses.length} 筆消費</div>
            </div>
          </div>
          {/* 貨幣切換 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {CURRENCIES.map(c => (
              <button
                key={c.code}
                onClick={() => setDisplayCurrency(c.code)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: displayCurrency === c.code ? '#FF8C42' : '#fff3ec',
                  color: displayCurrency === c.code ? '#fff' : '#b08060',
                  fontWeight: displayCurrency === c.code ? 500 : 400,
                }}
              >
                {c.symbol} {c.code}
              </button>
            ))}
          </div>

          {displayCurrency !== baseCurrency && (
            <div style={{ fontSize: 11, color: '#c4a882', marginBottom: 10 }}>
              ⚠️ 以即時匯率換算僅供參考，實際金額以 {getCurrency(baseCurrency).symbol} {baseCurrency} 為準
            </div>
          )}

          <div style={{ background: '#fff3ec', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: '#b08060', marginBottom: 2 }}>總支出</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: '#FF6B1A' }}>
                {rateLoading ? '...' : fmt(total)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#b08060', marginBottom: 2 }}>每人均攤</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: '#FF6B1A' }}>
                {rateLoading ? '...' : fmt(perPerson)}
              </div>
            </div>
          </div>
        </div>

        {/* 每人明細 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 12 }}>每人支出明細</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.members.map(uid => {
              const profile = group.memberProfiles?.[uid]
              const paid = expenses.filter(e => e.paidBy === uid).reduce((sum, e) => sum + e.amount, 0)
              const shouldPay = expenses.reduce((sum, e) => sum + (e.splits?.[uid] || 0), 0)
              const diff = paid - shouldPay

              return (
                <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar
                    src={profile?.avatar}
                    name={profile?.name}
                    size={36}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#3d2b1f', marginBottom: 2 }}>{profile?.name}</div>
                    <div style={{ fontSize: 11, color: '#b08060' }}>
                      付了 {fmt(paid)} · 應付 {fmt(shouldPay)}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 500, flexShrink: 0,
                    color: diff > 0.01 ? '#4caf50' : diff < -0.01 ? '#FF6B1A' : '#b08060'
                  }}>
                    {diff > 0.01 ? `+${fmt(diff)}` : diff < -0.01 ? fmt(diff) : '✓ 結清'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 轉帳建議 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 12 }}>轉帳建議</div>

          {settlements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#3d2b1f', marginBottom: 4 }}>大家都結清了！</div>
              <div style={{ fontSize: 13, color: '#b08060' }}>不需要任何轉帳</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {settlements.map((s, i) => {
                const from = group.memberProfiles?.[s.from]
                const to = group.memberProfiles?.[s.to]
                return (
                  <div
                    key={i}
                    style={{ background: '#fff3ec', borderRadius: 12, padding: '12px 14px', border: '0.5px solid #f0d5c0' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Avatar src={from?.avatar} name={from?.name} size={32} />
                      <div style={{ fontSize: 13, color: '#3d2b1f', flex: 1 }}>
                        <span style={{ fontWeight: 500 }}>{from?.name}</span>
                        <span style={{ color: '#b08060' }}> 轉給 </span>
                        <span style={{ fontWeight: 500 }}>{to?.name}</span>
                      </div>
                      <Avatar src={to?.avatar} name={to?.name} size={32} />
                    </div>
                    <button
                      onClick={() => {
                        const displayAmt = fmt(s.amount)
                        const msg = `💰 分帳提醒\n${from?.name} 需轉帳 ${displayAmt} 給 ${to?.name}`
                        navigator.clipboard.writeText(msg)
                        alert('已複製！可以貼到 LINE 提醒對方 😄')
                      }}
                      style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#FF8C42', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                    >
                      {rateLoading ? '...' : fmt(s.amount)} · 點我複製提醒訊息
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 回群組按鈕 */}
        <button
          onClick={() => navigate(`/group/${id}`)}
          style={{ width: '100%', padding: '15px 0', borderRadius: 16, border: '0.5px solid #f0d5c0', background: '#fff', color: '#FF8C42', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}
        >
          回到群組
        </button>
      </div>
      <TabBar context="settle" groupId={id} />
    </div>
  )
}

export default SettlePage