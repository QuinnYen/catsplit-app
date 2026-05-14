import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import Avatar from '../components/Avatar'
import { getCurrency } from '../config/currencies'
import { toLocalDateStr } from '../utils/expenseHelpers'

const SPLIT_LABEL = {
  equal: '平均分攤',
  subset: '部分成員',
  shares: '按份數',
  percentage: '按百分比',
  custom: '自訂金額',
}

const ExpenseDetailPage = () => {
  const { id, expenseId } = useParams()
  const { user } = useApp()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expense, setExpense] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      const [groupSnap, expenseSnap] = await Promise.all([
        getDoc(doc(db, 'groups', id)),
        getDoc(doc(db, 'groups', id, 'expenses', expenseId)),
      ])
      if (!groupSnap.exists() || !expenseSnap.exists()) return
      setGroup({ id: groupSnap.id, ...groupSnap.data() })
      setExpense({ id: expenseSnap.id, ...expenseSnap.data() })
    }
    fetchData()
  }, [id, expenseId])

  if (!group || !expense) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        載入中...
      </div>
    )
  }

  const isPayer = user?.uid === expense.paidBy
  const baseCurr = getCurrency(group.baseCurrency || 'TWD')
  const expCurr = getCurrency(expense.currency || group.baseCurrency || 'TWD')
  const hasFx = expense.currency && expense.currency !== (group.baseCurrency || 'TWD')

  const dateStr = expense.createdAt?.toDate
    ? toLocalDateStr(expense.createdAt.toDate())
    : ''

  const totalShares = expense.shares
    ? Object.values(expense.shares).reduce((s, v) => s + (Number(v) || 0), 0)
    : 0

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: 10, bottom: -10, fontSize: 64, opacity: 0.12, userSelect: 'none' }}>🐾</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >‹</button>
          <div style={{ flex: 1, color: '#fff', fontSize: 16, fontWeight: 500 }}>支出明細</div>
          {isPayer && (
            <button
              onClick={() => navigate(`/group/${id}/expense/${expenseId}/edit`)}
              style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 20, padding: '5px 14px', fontSize: 13, cursor: 'pointer' }}
            >
              編輯
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 主卡片 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 48, height: 48, background: '#fff3ec', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: '#FF6B1A', flexShrink: 0, textAlign: 'center', padding: '0 4px' }}>
              {expense.category || '其他'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: '#3d2b1f', marginBottom: 4, wordBreak: 'break-word' }}>{expense.title}</div>
              <div style={{ fontSize: 12, color: '#b08060' }}>{dateStr}</div>
            </div>
          </div>

          {/* 金額 */}
          <div style={{ background: '#fff3ec', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 11, color: '#b08060' }}>消費金額</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#FF6B1A' }}>
                {expCurr.symbol} {(expense.originalAmount ?? expense.amount).toLocaleString()}
              </div>
            </div>
            {hasFx && (
              <div style={{ textAlign: 'right', fontSize: 11, color: '#c4a882', marginTop: 2 }}>
                ≈ {baseCurr.symbol} {expense.amount.toLocaleString()}（匯率 {expense.exchangeRate?.toFixed(4)}）
              </div>
            )}
          </div>

          {/* 付款人 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar
              src={group.memberProfiles?.[expense.paidBy]?.avatar}
              name={group.memberProfiles?.[expense.paidBy]?.name}
              size={32}
            />
            <div>
              <div style={{ fontSize: 12, color: '#b08060' }}>由誰付款</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f' }}>
                {group.memberProfiles?.[expense.paidBy]?.name}
                {expense.payerExcluded && <span style={{ fontSize: 11, color: '#b08060', fontWeight: 400 }}> （不參與分攤）</span>}
              </div>
            </div>
          </div>
        </div>

        {/* 分攤明細 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060' }}>分攤方式</div>
            <div style={{ fontSize: 12, color: '#FF8C42', fontWeight: 500 }}>
              {SPLIT_LABEL[expense.splitType] || expense.splitType}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.members.map(uid => {
              const profile = group.memberProfiles?.[uid]
              const splitAmt = expense.splits?.[uid]
              if (splitAmt == null) return null

              const originalSplitAmt = hasFx && expense.exchangeRate
                ? splitAmt / expense.exchangeRate
                : splitAmt

              let hint = null
              if (expense.splitType === 'shares' && expense.shares?.[uid] != null) {
                hint = `${expense.shares[uid]} 份 / ${totalShares} 份`
              } else if (expense.splitType === 'percentage') {
                const pct = expense.amount > 0 ? ((splitAmt / expense.amount) * 100).toFixed(1) : '0'
                hint = `${pct}%`
              }

              return (
                <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar src={profile?.avatar} name={profile?.name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#3d2b1f' }}>{profile?.name}</div>
                    {hint && <div style={{ fontSize: 11, color: '#b08060' }}>{hint}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#FF6B1A' }}>
                      {expCurr.symbol} {parseFloat(originalSplitAmt.toFixed(2)).toLocaleString()}
                    </div>
                    {hasFx && (
                      <div style={{ fontSize: 11, color: '#c4a882' }}>
                        ≈ {baseCurr.symbol} {Math.round(splitAmt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 收據圖片 */}
        {expense.receiptUrl && (
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>收據照片</div>
            <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={expense.receiptUrl}
                alt="收據"
                style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 10, background: '#f5f0eb', display: 'block' }}
              />
            </a>
          </div>
        )}

        {/* 我的份額卡 */}
        {expense.splits?.[user?.uid] != null && (
          <div style={{ background: user?.uid === expense.paidBy ? '#f0faf0' : '#fff3ec', borderRadius: 16, border: `0.5px solid ${user?.uid === expense.paidBy ? '#c8e6c9' : '#f0d5c0'}`, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: user?.uid === expense.paidBy ? '#4caf50' : '#b08060', marginBottom: 2 }}>
                {user?.uid === expense.paidBy ? '你付款，待收回' : '你應付'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: user?.uid === expense.paidBy ? '#2e7d32' : '#FF6B1A' }}>
                {expCurr.symbol} {parseFloat(
                  hasFx && expense.exchangeRate
                    ? (expense.splits[user.uid] / expense.exchangeRate).toFixed(2)
                    : expense.splits[user.uid].toFixed(2)
                ).toLocaleString()}
              </div>
            </div>
            <div style={{ fontSize: 32 }}>{user?.uid === expense.paidBy ? '💚' : '💸'}</div>
          </div>
        )}

      </div>
    </div>
  )
}

export default ExpenseDetailPage
