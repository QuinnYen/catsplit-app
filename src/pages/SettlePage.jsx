import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, getDoc, getDocs } from 'firebase/firestore'
import { db } from '../config/firebase'

const SettlePage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      // 載入群組
      const groupSnap = await getDoc(doc(db, 'groups', id))
      if (!groupSnap.exists()) return
      const groupData = { id: groupSnap.id, ...groupSnap.data() }
      setGroup(groupData)

      // 載入支出
      const expensesSnap = await getDocs(collection(db, 'groups', id, 'expenses'))
      const expensesData = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setExpenses(expensesData)

      // 計算每人淨額
      // balance > 0 代表別人欠他，< 0 代表他欠別人
      const balance = {}
      groupData.members.forEach(uid => { balance[uid] = 0 })

      expensesData.forEach(expense => {
        // 付款人加上總金額
        balance[expense.paidBy] = (balance[expense.paidBy] || 0) + expense.amount

        // 每人扣掉應付金額
        Object.entries(expense.splits || {}).forEach(([uid, amt]) => {
          balance[uid] = (balance[uid] || 0) - amt
        })
      })

      // 最小化轉帳次數演算法
      const result = []
      const creditors = [] // 被欠錢的人（balance > 0）
      const debtors = []   // 欠錢的人（balance < 0）

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
      setLoading(false)
    }

    fetchData()
  }, [id])

  if (loading || !group) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        計算中...
      </div>
    )
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const perPerson = group.members.length > 0
    ? (total / group.members.length).toFixed(0)
    : 0

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-500 text-xl"
        >
          ‹
        </button>
        <h1 className="font-bold text-gray-800 text-lg">結算</h1>
      </div>

      <div className="px-4 py-6 flex flex-col gap-4">

        {/* 總覽卡片 */}
        <div className="bg-green-500 rounded-2xl p-5 text-white shadow">
          <p className="text-sm opacity-80 mb-1">{group.emoji} {group.name}</p>
          <p className="text-3xl font-bold">NT$ {total.toLocaleString()}</p>
          <div className="flex gap-4 mt-3 text-sm opacity-80">
            <span>共 {expenses.length} 筆</span>
            <span>•</span>
            <span>{group.members.length} 人均攤約 NT$ {parseInt(perPerson).toLocaleString()}</span>
          </div>
        </div>

        {/* 每人支出明細 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-500 mb-3">每人支出明細</p>
          <div className="flex flex-col gap-3">
            {group.members.map(uid => {
              const profile = group.memberProfiles?.[uid]
              // 計算此人實際付出
              const paid = expenses
                .filter(e => e.paidBy === uid)
                .reduce((sum, e) => sum + e.amount, 0)
              // 計算此人應付
              const shouldPay = expenses
                .reduce((sum, e) => sum + (e.splits?.[uid] || 0), 0)
              const diff = paid - shouldPay

              return (
                <div key={uid} className="flex items-center gap-3">
                  <img
                    src={profile?.avatar}
                    alt={profile?.name}
                    className="w-9 h-9 rounded-full object-cover bg-gray-100"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-700">{profile?.name}</p>
                    <p className="text-xs text-gray-400">
                      付了 NT$ {paid.toLocaleString()}，應付 NT$ {shouldPay.toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-sm font-bold ${
                    diff > 0.01
                      ? 'text-green-500'
                      : diff < -0.01
                        ? 'text-red-400'
                        : 'text-gray-400'
                  }`}>
                    {diff > 0.01
                      ? `+${diff.toLocaleString()}`
                      : diff < -0.01
                        ? `${diff.toLocaleString()}`
                        : '✓ 結清'
                    }
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 轉帳建議 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-500 mb-3">轉帳建議</p>

          {settlements.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-2">🎉</div>
              <p className="text-gray-500 font-semibold">大家都結清了！</p>
              <p className="text-gray-400 text-sm mt-1">不需要任何轉帳</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {settlements.map((s, i) => {
                const from = group.memberProfiles?.[s.from]
                const to = group.memberProfiles?.[s.to]
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100"
                  >
                    <img
                      src={from?.avatar}
                      alt={from?.name}
                      className="w-8 h-8 rounded-full object-cover bg-gray-100"
                    />
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">
                        <span className="font-bold">{from?.name}</span>
                        <span className="text-gray-400"> 轉給 </span>
                        <span className="font-bold">{to?.name}</span>
                      </p>
                      <p className="text-xs text-gray-400">點選複製提醒訊息</p>
                    </div>
                    <button
                      onClick={() => {
                        const msg = `💰 分帳提醒\n${from?.name} 需轉帳 NT$${s.amount} 給 ${to?.name}`
                        navigator.clipboard.writeText(msg)
                        alert('已複製！可以貼到 LINE 提醒對方 😄')
                      }}
                      className="text-lg font-bold text-orange-500 bg-white border border-orange-200 rounded-xl px-3 py-2"
                    >
                      NT$ {s.amount.toLocaleString()}
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
          className="w-full py-4 rounded-2xl font-bold text-white bg-green-500 shadow active:scale-95 transition-all"
        >
          回到群組
        </button>
      </div>
    </div>
  )
}

export default SettlePage