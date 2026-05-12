import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import Avatar from '../components/Avatar'

const JoinGroupPage = () => {
  const { id } = useParams()
  const { user } = useApp()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const fetchGroup = async () => {
      try {
        const snap = await getDoc(doc(db, 'groups', id))
        if (!snap.exists()) { setStatus('error'); return }
        const data = { id: snap.id, ...snap.data() }
        setGroup(data)
        if (data.members.includes(user?.uid)) {
          navigate(`/group/${id}`, { replace: true })
          return
        }
        setStatus('preview')
      } catch (error) {
        console.error(error)
        setStatus('error')
      }
    }
    if (user) fetchGroup()
  }, [id, user])

  const handleJoin = async () => {
    setStatus('joining')
    try {
      await updateDoc(doc(db, 'groups', id), {
        members: arrayUnion(user.uid),
        [`memberProfiles.${user.uid}`]: {
          name: user.name,
          avatar: user.avatar,
        }
      })
      setStatus('joined')
      setTimeout(() => navigate(`/group/${id}`), 1500)
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  // 載入中
  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🐱</div>
          <div style={{ color: '#b08060', fontSize: 14 }}>載入中...</div>
        </div>
      </div>
    )
  }

  // 錯誤
  if (status === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>😿</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#3d2b1f', marginBottom: 6 }}>找不到這個群組</div>
          <div style={{ fontSize: 13, color: '#b08060', marginBottom: 24 }}>連結可能已失效</div>
          <button
            onClick={() => navigate('/')}
            style={{ background: '#FF8C42', color: '#fff', border: 'none', borderRadius: 14, padding: '12px 28px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            回首頁
          </button>
        </div>
      </div>
    )
  }

  // 加入成功
  if (status === 'joined') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#3d2b1f', marginBottom: 6 }}>加入成功！</div>
          <div style={{ fontSize: 13, color: '#b08060' }}>正在跳轉...</div>
        </div>
      </div>
    )
  }

  // 加入預覽
  const profiles = Object.values(group?.memberProfiles || {})

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: 10, bottom: -10, fontSize: 64, opacity: 0.12, userSelect: 'none' }}>🐾</div>
        <div style={{ textAlign: 'center', paddingTop: 8 }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>{group?.emoji}</div>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 500, marginBottom: 4 }}>{group?.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>你被邀請加入這個群組！</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>

        {/* 群組資訊 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>目前成員</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profiles.map((member, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar
                  src={member.avatar}
                  name={member.name}
                  size={36}
                />
                <div style={{ fontSize: 14, color: '#3d2b1f', fontWeight: 500 }}>{member.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 以此身份加入 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>以此身份加入</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff3ec', borderRadius: 12, padding: '10px 12px' }}>
            <Avatar
              src={user?.avatar}
              name={user?.name}
              size={40}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f' }}>{user?.name}</div>
              <div style={{ fontSize: 12, color: '#b08060', marginTop: 2 }}>LINE 帳號</div>
            </div>
            <div style={{ marginLeft: 'auto', color: '#FF8C42', fontSize: 18 }}>✓</div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* 加入按鈕 */}
        <button
          onClick={handleJoin}
          disabled={status === 'joining'}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', fontSize: 15, fontWeight: 500, cursor: status === 'joining' ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
            background: status === 'joining' ? '#e0c4b0' : '#FF8C42',
            color: '#fff',
          }}
        >
          {status === 'joining' ? '加入中...' : `🐱 加入「${group?.name}」`}
        </button>

        <button
          onClick={() => navigate('/')}
          style={{ width: '100%', padding: '12px 0', borderRadius: 16, border: '0.5px solid #f0d5c0', background: '#fff', color: '#b08060', fontSize: 14, cursor: 'pointer' }}
        >
          取消
        </button>
      </div>
    </div>
  )
}

export default JoinGroupPage