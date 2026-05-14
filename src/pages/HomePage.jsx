import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'
import { getCurrency } from '../config/currencies'

const HomePage = () => {
  const { user, loading: authLoading, loginWithLine, logout } = useApp()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

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

  const activeGroups = groups.filter(g => !g.archived)
  const archivedGroups = groups.filter(g => g.archived)
  const totalExpenses = activeGroups.reduce((sum, g) => sum + (g.totalExpenses || 0), 0)

  if (!authLoading && !user) {
    return (
      <div style={{ minHeight: '100vh', background: '#fff8f4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
          {/* 裝飾 */}
          <div style={{ position: 'absolute', top: -24, right: -8, fontSize: 72, opacity: 0.08, userSelect: 'none', pointerEvents: 'none' }}>🐾</div>

          {/* Logo / Icon */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, marginBottom: 16, boxShadow: '0 8px 24px rgba(255,107,26,0.25)' }}>
              🐱
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#3d2b1f', marginBottom: 6 }}>CatSplit</div>
            <div style={{ fontSize: 14, color: '#b08060', lineHeight: 1.6 }}>
              和朋友一起分攤費用<br />簡單記帳，輕鬆結算
            </div>
          </div>

          {/* 特色說明 */}
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: '16px 18px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { icon: '👥', text: '建立群組，邀請朋友加入' },
              { icon: '💰', text: '多幣別支出，自動換算' },
              { icon: '🧮', text: '智慧分帳，最少轉帳次數' },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 22, width: 32, textAlign: 'center', flexShrink: 0 }}>{icon}</div>
                <div style={{ fontSize: 13, color: '#5a3e2b' }}>{text}</div>
              </div>
            ))}
          </div>

          {/* LINE 登入按鈕 */}
          <button
            onClick={() => loginWithLine()}
            style={{ width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', background: '#06C755', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 16px rgba(6,199,85,0.35)' }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2C6.03 2 2 5.58 2 10c0 3.54 2.56 6.57 6.24 7.73-.09.31-.56 1.97-.64 2.27 0 0-.04.14.07.19.11.06.24.01.24.01.32-.04 3.72-2.45 4.09-2.7.66.09 1.34.14 2.03.14 4.97 0 9-3.58 9-8s-4.03-8-9-8z" fill="white"/>
            </svg>
            以 LINE 帳號登入
          </button>
        </div>
      </div>
    )
  }

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
          <button
            onClick={() => { if (confirm('確定要登出嗎？')) logout() }}
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 20, padding: '5px 12px', fontSize: 12, color: '#fff', cursor: 'pointer' }}
          >
            登出
          </button>
        </div>

        {/* 總覽卡片 */}
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 14, border: '1px solid rgba(255,255,255,0.3)' }}>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginBottom: 4 }}>消費總覽</div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 500 }}>
            {totalExpenses} 筆消費
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 }}>
            {groups.length} 個群組
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
        {!loading && activeGroups.length === 0 && archivedGroups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🐱</div>
            <div style={{ color: '#b08060', fontSize: 14, marginBottom: 4 }}>還沒有任何群組</div>
            <div style={{ color: '#c4a882', fontSize: 13 }}>點右上角建立第一個吧！</div>
          </div>
        )}

        {/* 群組卡片 render helper */}
        {!loading && (() => {
          const renderCard = (group) => {
            const profiles = Object.values(group.memberProfiles || {}).slice(0, 3)
            const bal = group.memberBalances?.[user?.uid] ?? null
            const isSettled = bal !== null && Math.abs(bal) < 0.01
            const isPositive = bal !== null && bal > 0.01
            return (
              <div
                key={group.id}
                onClick={() => navigate(`/group/${group.id}`)}
                style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
                onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
                onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{ width: 48, height: 48, borderRadius: 14, background: '#fff3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
                  {group.emoji || '🐱'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b08060' }}>
                    <div style={{ display: 'flex' }}>
                      {profiles.map((member, i) => (
                        <Avatar key={i} src={member.avatar} name={member.name} size={18} style={{ border: '1.5px solid #fff', marginLeft: i === 0 ? 0 : -5 }} />
                      ))}
                    </div>
                    {group.members?.length} 位成員
                  </div>
                </div>
                {bal === null ? (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#FF6B1A' }}>
                      {getCurrency(group.baseCurrency).symbol} {(group.totalAmount || 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: '#b08060' }}>總支出</div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: isSettled ? '#b08060' : isPositive ? '#4caf50' : '#FF6B1A' }}>
                      {isSettled ? '✓ 結清' : isPositive
                        ? `+${getCurrency(group.baseCurrency).symbol} ${Math.round(bal).toLocaleString()}`
                        : `${getCurrency(group.baseCurrency).symbol} ${Math.round(bal).toLocaleString()}`}
                    </div>
                    <div style={{ fontSize: 11, color: '#b08060' }}>
                      {isSettled ? '' : isPositive ? '待收款' : '待付款'}
                    </div>
                  </div>
                )}
                <div style={{ color: '#e0b898', fontSize: 18 }}>›</div>
              </div>
            )
          }

          return (
            <>
              {/* 一般群組 */}
              {activeGroups.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activeGroups.map(renderCard)}
                </div>
              )}

              {/* 已封存群組 */}
              {archivedGroups.length > 0 && (
                <div style={{ marginTop: activeGroups.length > 0 ? 20 : 0 }}>
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 10 }}
                  >
                    <span style={{ fontSize: 12, color: '#b08060', fontWeight: 500 }}>已封存群組（{archivedGroups.length}）</span>
                    <span style={{ fontSize: 11, color: '#c4a882', transform: showArchived ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.2s' }}>›</span>
                  </button>
                  {showArchived && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.65 }}>
                      {archivedGroups.map(renderCard)}
                    </div>
                  )}
                </div>
              )}
            </>
          )
        })()}
      </div>

      <TabBar context="home" />
    </div>
  )
}

export default HomePage