import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'

const GroupPage = () => {
  const { id } = useParams()
  const { user } = useApp()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  // 監聽群組資料
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'groups', id), (snap) => {
      if (snap.exists()) {
        setGroup({ id: snap.id, ...snap.data() })
      }
    })
    return () => unsubscribe()
  }, [id])

  // 監聽支出列表
  useEffect(() => {
    const q = query(
      collection(db, 'groups', id, 'expenses'),
      orderBy('createdAt', 'desc')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setExpenses(data)
      setLoading(false)
    }, (error) => {
      console.error('載入支出失敗:', error)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [id])

  // 計算總金額
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  // 邀請連結
  const handleInvite = () => {
    const url = `${window.location.origin}/group/${id}`
    if (navigator.share) {
      navigator.share({ title: group?.name, url })
    } else {
      navigator.clipboard.writeText(url)
      alert('連結已複製！')
    }
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        載入中...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate('/')}
            className="text-gray-500 text-xl"
          >
            ‹
          </button>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-2xl">{group.emoji}</span>
            <h1 className="font-bold text-gray-800 text-lg">{group.name}</h1>
          </div>
          <button
            onClick={handleInvite}
            className="text-sm text-green-500 border border-green-400 px-3 py-1 rounded-full"
          >
            邀請
          </button>
        </div>

        {/* 成員頭像列 */}
        <div className="flex items-center gap-1 pl-8">
          {Object.values(group.memberProfiles || {}).map((member, i) => (
            <img
              key={i}
              src={member.avatar}
              alt={member.name}
              title={member.name}
              className="w-7 h-7 rounded-full object-cover bg-gray-100 border-2 border-white -ml-1 first:ml-0"
            />
          ))}
          <span className="text-xs text-gray-400 ml-2">
            {group.members?.length} 位成員
          </span>
        </div>
      </div>

      {/* 總金額卡片 */}
      <div className="mx-4 mt-4 bg-green-500 rounded-2xl p-4 text-white shadow">
        <p className="text-sm opacity-80">總支出</p>
        <p className="text-3xl font-bold mt-1">
          NT$ {total.toLocaleString()}
        </p>
        <p className="text-sm opacity-80 mt-1">
          共 {expenses.length} 筆消費
        </p>
      </div>

      {/* 操作按鈕 */}
      <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate(`/group/${id}/add`)}
          className="bg-white rounded-2xl shadow-sm p-4 text-center active:scale-95 transition-transform"
        >
          <div className="text-2xl mb-1">➕</div>
          <p className="text-sm font-semibold text-gray-700">新增支出</p>
        </button>
        <button
          onClick={() => navigate(`/group/${id}/settle`)}
          className="bg-white rounded-2xl shadow-sm p-4 text-center active:scale-95 transition-transform"
        >
          <div className="text-2xl mb-1">🧮</div>
          <p className="text-sm font-semibold text-gray-700">結算</p>
        </button>
      </div>

      {/* 支出列表 */}
      <div className="px-4 py-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">消費明細</h2>

        {loading && (
          <div className="text-center py-8 text-gray-400">載入中...</div>
        )}

        {!loading && expenses.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🧾</div>
            <p className="text-gray-400 text-sm">還沒有任何支出</p>
            <p className="text-gray-400 text-sm">點上方新增第一筆吧！</p>
          </div>
        )}

        {!loading && expenses.length > 0 && (
          <div className="flex flex-col gap-3">
            {expenses.map(expense => (
              <div
                key={expense.id}
                className="bg-white rounded-2xl shadow-sm p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{expense.emoji || '💰'}</div>
                    <div>
                      <p className="font-semibold text-gray-800">{expense.title}</p>
                      <p className="text-xs text-gray-400">
                        {group.memberProfiles?.[expense.paidBy]?.name || '未知'} 付款
                      </p>
                    </div>
                  </div>
                  <p className="font-bold text-gray-800">
                    NT$ {expense.amount.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default GroupPage