// /group/:id/settle — 結算：每人餘額、最少轉帳次數的轉帳建議（可換算貨幣）與已結清紀錄。
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, getDoc, getDocs } from 'firebase/firestore'
import { AlertTriangle, Check, CheckCircle2, PartyPopper } from 'lucide-react'
import { db } from '../config/firebase'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'
import GroupIcon from '../components/GroupIcon'
import PawDecor from '../components/PawDecor'
import { CURRENCIES, getCurrency } from '../config/currencies'
import useExchangeRate from '../hooks/useExchangeRate'

const SettlePage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [settledRecords, setSettledRecords] = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)
  const [displayCurrency, setDisplayCurrency] = useState(null)

  const baseCurrency = group?.baseCurrency || 'TWD'
  // hook: fetchExchangeRate(from=baseCurrency, to=displayCurrency)
  const { exchangeRate, rateLoading } = useExchangeRate(baseCurrency, displayCurrency || baseCurrency)
  const displayRate = exchangeRate ?? 1

  useEffect(() => {
    const fetchData = async () => {
      const groupSnap = await getDoc(doc(db, 'groups', id))
      if (!groupSnap.exists()) return
      const groupData = { id: groupSnap.id, ...groupSnap.data() }
      setGroup(groupData)

      const expensesSnap = await getDocs(collection(db, 'groups', id, 'expenses'))
      const expensesData = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setExpenses(expensesData)

      const settlementsSnap = await getDocs(collection(db, 'groups', id, 'settlements'))
      const settlementsData = settlementsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setSettledRecords(settlementsData)

      // 計算餘額：支出分帳 + 已結清紀錄
      const balance = {}
      groupData.members.forEach(uid => { balance[uid] = 0 })

      expensesData.forEach(expense => {
        Object.entries(expense.payments || {}).forEach(([uid, amt]) => {
          balance[uid] = (balance[uid] || 0) + amt
        })
        Object.entries(expense.splits || {}).forEach(([uid, amt]) => {
          balance[uid] = (balance[uid] || 0) - amt
        })
      })

      // 已結清的轉帳紀錄：付款者欠款減少(+)，收款者待收減少(-)
      settlementsData.forEach(s => {
        balance[s.from] = (balance[s.from] || 0) + s.amount
        balance[s.to] = (balance[s.to] || 0) - s.amount
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

  if (loading || !group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        計算中...
      </div>
    )
  }

  const dispCurr = getCurrency(displayCurrency || baseCurrency)
  const fmt = (amount) => `${dispCurr.symbol} ${Math.round(amount * displayRate).toLocaleString()}`

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalText = rateLoading ? '...' : fmt(total)

  // 金額位數多時逐級縮小字體，最後才用「…」截斷
  const amountStyle = (text) => ({
    fontSize: text.length <= 10 ? 22 : text.length <= 13 ? 18 : text.length <= 16 ? 15 : 13,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', display: 'flex', flexDirection: 'column', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <PawDecor />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}`)}
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
            <GroupIcon icon={group.icon} color={group.iconColor} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#3d2b1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</div>
                <div style={{ fontSize: 11, color: '#b08060', flexShrink: 0 }}>總支出</div>
              </div>
              <div style={{ fontSize: 12, color: '#b08060' }}>{group.members.length} 位成員 · {expenses.length} 筆消費</div>
            </div>
          </div>

          {/* 貨幣選單 + 總支出 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <select
                value={displayCurrency}
                onChange={e => setDisplayCurrency(e.target.value)}
                style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '8px 10px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
              >
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
              </select>
              {displayCurrency !== baseCurrency && (
                <div style={{ fontSize: 11, color: '#c4a882', marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} /> 以即時匯率換算僅供參考，實際金額以 {getCurrency(baseCurrency).symbol} {baseCurrency} 為準
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
              <div style={{ ...amountStyle(totalText), fontWeight: 500, color: '#FF6B1A' }}>{totalText}</div>
            </div>
          </div>
        </div>

        {/* 每人明細 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 12 }}>每人支出明細</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.members.map(uid => {
              const profile = group.memberProfiles?.[uid]
              const paid = expenses.reduce((sum, e) => sum + (e.payments?.[uid] || 0), 0)
              const shouldPay = expenses.reduce((sum, e) => sum + (e.splits?.[uid] || 0), 0)
              const transferred = settledRecords
                .filter(s => s.from === uid).reduce((sum, s) => sum + s.amount, 0)
              const received = settledRecords
                .filter(s => s.to === uid).reduce((sum, s) => sum + s.amount, 0)
              const diff = paid - shouldPay + received - transferred

              return (
                <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar src={profile?.avatar} name={profile?.name} size={36} />
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
                    {diff > 0.01 ? `+${fmt(diff)}` : diff < -0.01 ? fmt(diff) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Check size={13} strokeWidth={3} /> 結清
                      </span>
                    )}
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
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><PartyPopper size={48} color="#FF8C42" /></div>
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
                      <div style={{ fontSize: 13, color: '#3d2b1f', flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from?.name}</div>
                        <div style={{ display: 'flex', marginTop: 2 }}>
                          <span style={{ color: '#b08060', flexShrink: 0, whiteSpace: 'nowrap' }}>轉給&nbsp;</span>
                          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to?.name}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#FF6B1A', flexShrink: 0 }}>
                        {rateLoading ? '...' : fmt(s.amount)}
                      </div>
                      <Avatar src={to?.avatar} name={to?.name} size={32} />
                    </div>
                    <button
                      onClick={() => navigate(
                        `/group/${id}/transfer?from=${s.from}&to=${s.to}&amount=${s.amount}&currency=${baseCurrency}`
                      )}
                      style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#FF8C42', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                    >
                      去轉帳 →
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 已結清紀錄 */}
        {settledRecords.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 12 }}>已結清紀錄</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {settledRecords.map(s => {
                const from = group.memberProfiles?.[s.from]
                const to = group.memberProfiles?.[s.to]
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '0.5px solid #f5e8dc' }}>
                    <CheckCircle2 size={16} color="#4caf50" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#b08060' }}>
                      <div style={{ color: '#3d2b1f', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from?.name}</div>
                      <div style={{ display: 'flex', marginTop: 2 }}>
                        <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>轉給&nbsp;</span>
                        <span style={{ color: '#3d2b1f', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to?.name}</span>
                        {s.paymentMethod && <span style={{ marginLeft: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>· {s.paymentMethod}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#4caf50', flexShrink: 0 }}>
                      {getCurrency(s.currency || baseCurrency).symbol} {s.amount.toLocaleString()}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <TabBar context="settle" groupId={id} />
    </div>
  )
}

export default SettlePage
