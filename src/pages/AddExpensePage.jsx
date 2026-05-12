import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import TabBar from '../components/TabBar'

const EMOJIS = ['💰', '🍕', '🍜', '🍣', '🍺', '☕', '🛒', '🚗', '🏨', '🎮', '🎉', '✈️']
const SPLIT_TYPES = [
  { key: 'equal', label: '均分' },
  { key: 'custom', label: '自訂金額' },
]

const AddExpensePage = () => {
  const { id } = useParams()
  const { user } = useApp()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('💰')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(user?.uid)
  const [splitType, setSplitType] = useState('equal')
  const [customAmounts, setCustomAmounts] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchGroup = async () => {
      const snap = await getDoc(doc(db, 'groups', id))
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setGroup(data)
        const init = {}
        data.members.forEach(uid => { init[uid] = '' })
        setCustomAmounts(init)
      }
    }
    fetchGroup()
  }, [id])

  const customTotal = Object.values(customAmounts)
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

  const isValid = () => {
    if (!title.trim()) return false
    if (!amount || parseFloat(amount) <= 0) return false
    if (splitType === 'custom') {
      if (Math.abs(customTotal - parseFloat(amount)) > 0.01) return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!isValid()) return
    setLoading(true)
    try {
      const totalAmount = parseFloat(amount)
      const members = group.members
      let splits = {}
      if (splitType === 'equal') {
        const each = totalAmount / members.length
        members.forEach(uid => { splits[uid] = parseFloat(each.toFixed(2)) })
      } else {
        members.forEach(uid => { splits[uid] = parseFloat(customAmounts[uid]) || 0 })
      }

      await addDoc(collection(db, 'groups', id, 'expenses'), {
        title: title.trim(),
        emoji,
        amount: totalAmount,
        paidBy,
        splitType,
        splits,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })

      await updateDoc(doc(db, 'groups', id), {
        totalAmount: increment(totalAmount),
        totalExpenses: increment(1),
      })

      navigate(`/group/${id}`)
    } catch (error) {
      console.error('新增失敗', error)
      setLoading(false)
    }
  }

  if (!group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        載入中...
      </div>
    )
  }

  const members = Object.entries(group.memberProfiles || {})

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 32 }}>

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
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>新增支出</div>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 類別 Emoji */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>類別</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                style={{
                  fontSize: 22, padding: 6, borderRadius: 10, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: emoji === e ? '#fff3ec' : 'transparent',
                  outline: emoji === e ? '2px solid #FF8C42' : 'none',
                  transform: emoji === e ? 'scale(1.15)' : 'scale(1)',
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* 名稱 & 金額 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>項目名稱</div>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：晚餐、計程車..."
              maxLength={20}
              style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>金額</div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#b08060', fontSize: 13 }}>NT$</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px 10px 44px', fontSize: 20, fontWeight: 500, color: '#FF6B1A', outline: 'none', background: '#fff8f4' }}
              />
            </div>
          </div>
        </div>

        {/* 誰付錢 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>誰付錢</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(([uid, profile]) => (
              <button
                key={uid}
                onClick={() => setPaidBy(uid)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s', border: 'none',
                  background: paidBy === uid ? '#fff3ec' : '#fff8f4',
                  outline: paidBy === uid ? '1.5px solid #FF8C42' : '0.5px solid #f0d5c0',
                }}
              >
                <img src={profile.avatar} alt={profile.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', background: '#ffd4b3' }} />
                <span style={{ fontSize: 14, color: '#3d2b1f', fontWeight: paidBy === uid ? 500 : 400, flex: 1, textAlign: 'left' }}>{profile.name}</span>
                {paidBy === uid && <span style={{ color: '#FF8C42', fontSize: 16 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 分帳方式 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>分帳方式</div>

          {/* 切換按鈕 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {SPLIT_TYPES.map(type => (
              <button
                key={type.key}
                onClick={() => setSplitType(type.key)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                  background: splitType === type.key ? '#FF8C42' : '#fff3ec',
                  color: splitType === type.key ? '#fff' : '#b08060',
                }}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* 均分預覽 */}
          {splitType === 'equal' && amount && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map(([uid, profile]) => (
                <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={profile.avatar} alt={profile.name} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', background: '#ffd4b3' }} />
                  <span style={{ flex: 1, fontSize: 13, color: '#3d2b1f' }}>{profile.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#FF6B1A' }}>
                    NT$ {(parseFloat(amount) / members.length).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 自訂金額 */}
          {splitType === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {members.map(([uid, profile]) => (
                <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={profile.avatar} alt={profile.name} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', background: '#ffd4b3' }} />
                  <span style={{ flex: 1, fontSize: 13, color: '#3d2b1f' }}>{profile.name}</span>
                  <div style={{ position: 'relative', width: 110 }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#b08060', fontSize: 12 }}>NT$</span>
                    <input
                      type="number"
                      value={customAmounts[uid]}
                      onChange={e => setCustomAmounts(prev => ({ ...prev, [uid]: e.target.value }))}
                      placeholder="0"
                      style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 8, padding: '7px 8px 7px 34px', fontSize: 13, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
                    />
                  </div>
                </div>
              ))}
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: Math.abs(customTotal - (parseFloat(amount) || 0)) < 0.01 ? '#4caf50' : '#FF6B1A' }}>
                已分配 NT$ {customTotal.toFixed(0)} / {amount || 0}
              </div>
            </div>
          )}
        </div>

        {/* 送出按鈕 */}
        <button
          onClick={handleSubmit}
          disabled={!isValid() || loading}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', fontSize: 15, fontWeight: 500, cursor: isValid() && !loading ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
            background: isValid() && !loading ? '#FF8C42' : '#e0c4b0',
            color: '#fff',
          }}
        >
          {loading ? '新增中...' : '✅ 確認新增'}
        </button>
      </div>

      <TabBar context="expense" groupId={id} />
    </div>
  )
}

export default AddExpensePage