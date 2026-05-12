import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'

const HomePage = () => {
  const { user } = useApp()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const q = query(
      collection(db, 'groups'),
      where('members', 'array-contains', user.uid),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setGroups(data)
      setLoading(false)
    }, (error) => {
      console.error('載入群組失敗:', error)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [user])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={user?.avatar}
            alt="avatar"
            className="w-9 h-9 rounded-full object-cover shrink-0 bg-gray-100"
          />
          <div>
            <p className="text-xs text-gray-400">歡迎回來</p>
            <p className="font-semibold text-gray-800">{user?.name}</p>
          </div>
        </div>
        <span className="text-2xl">🐱</span>
      </div>

      {/* 內容 */}
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">我的群組</h2>
          <button
            onClick={() => navigate('/create')}
            className="bg-green-500 text-white text-sm px-4 py-2 rounded-full shadow active:scale-95 transition-transform"
          >
            ＋ 建立群組
          </button>
        </div>

        {/* 載入中 */}
        {loading && (
          <div className="text-center py-16 text-gray-400">載入中...</div>
        )}

        {/* 空狀態 */}
        {!loading && groups.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🐱</div>
            <p className="text-gray-400 mb-1">還沒有任何群組</p>
            <p className="text-gray-400 text-sm">點右上角建立第一個吧！</p>
          </div>
        )}

        {/* 群組列表 */}
        {!loading && groups.length > 0 && (
          <div className="flex flex-col gap-3">
            {groups.map(group => (
              <div
                key={group.id}
                onClick={() => navigate(`/group/${group.id}`)}
                className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between active:scale-95 transition-transform cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{group.emoji || '🐱'}</div>
                  <div>
                    <p className="font-semibold text-gray-800">{group.name}</p>
                    <p className="text-xs text-gray-400">{group.members?.length} 位成員</p>
                  </div>
                </div>
                <span className="text-gray-300 text-xl">›</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default HomePage