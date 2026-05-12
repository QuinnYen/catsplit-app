import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'

const HomePage = () => {
  const { user, loading: authLoading } = useApp()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
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
      console.error('Firestore 讀取失敗:', error)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [user, authLoading])

  // 計算所有群組總支出（從 groups 的 totalAmount 欄位，之後新增支出時會更新）
  const totalAmount = groups.reduce((sum, g) => sum + (g.totalAmount || 0), 0)
  const totalExpenses = groups.reduce((sum, g) => sum + (g.totalExpenses || 0), 0)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#fff8f4' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '20px 16px 28px', position: 'relative', overflow: 'hidden' }}>

        {/* 裝飾爪印 */}
        <div style={{ position: 'absolute', right: 14, bottom: -8, fontSize: 64, opacity: 0.12, userSelect: 'none' }}>🐾</div>

        {/* 使用者資訊 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar
              src={user?.avatar}
              name={user?.name}
              size={38}
              style={{ background: '#ffe0c8', border: '2px solid rgba(255,255,255,0.6)' }}
            />
            <div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>歡迎回來</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{user?.name}</div>
            </div>
          </div>
          <div style={{ fontSize: 28 }}>🐾</div>
        </div>

        {/* 總覽卡片 */}
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 14, border: '1px solid rgba(255,255,255,0.3)' }}>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginBottom: 4 }}>本月總支出</div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 500 }}>
            NT$ {totalAmount.toLocaleString()}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 }}>
            {groups.length} 個群組 · {totalExpenses} 筆消費
          </div>
        </div>
      </div>

      {/* 內容 */}
      <div style={{ padding: '16px', flex: 1, paddingBottom: 80 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#3d2b1f' }}>我的群組</div>
          <button
            onClick={() => navigate('/create')}
            style={{ background: '#FF8C42', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          >
            ＋ 建立群組
          </button>
        </div>

        {/* 載入中 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#b08060' }}>載入中...</div>
        )}

        {/* 空狀態 */}
        {!loading && groups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🐱</div>
            <div style={{ color: '#b08060', fontSize: 14, marginBottom: 4 }}>還沒有任何群組</div>
            <div style={{ color: '#c4a882', fontSize: 13 }}>點右上角建立第一個吧！</div>
          </div>
        )}

        {/* 群組列表 */}
        {!loading && groups.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map(group => {
              const profiles = Object.values(group.memberProfiles || {}).slice(0, 3)
              return (
                <div
                  key={group.id}
                  onClick={() => navigate(`/group/${group.id}`)}
                  style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'transform 0.1s', userSelect: 'none' }}
                  onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
                  onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {/* Emoji */}
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: '#fff3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
                    {group.emoji || '🐱'}
                  </div>

                  {/* 群組資訊 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {group.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b08060' }}>
                      {/* 小頭像 */}
                      <div style={{ display: 'flex' }}>
                        {profiles.map((member, i) => (
                          <Avatar
                            key={i}
                            src={member.avatar}
                            name={member.name}
                            size={18}
                            style={{ border: '1.5px solid #fff', marginLeft: i === 0 ? 0 : -5 }}
                          />
                        ))}
                      </div>
                      {group.members?.length} 位成員
                    </div>
                  </div>

                  {/* 金額 */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#FF6B1A' }}>
                      NT$ {(group.totalAmount || 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: '#b08060' }}>總支出</div>
                  </div>

                  <div style={{ color: '#e0b898', fontSize: 18 }}>›</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <TabBar context="home" />
    </div>
  )
}

export default HomePage