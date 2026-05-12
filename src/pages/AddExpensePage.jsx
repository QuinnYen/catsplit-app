import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import { useEffect } from 'react'

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

  // 載入群組資料
  useEffect(() => {
    const fetchGroup = async () => {
      const snap = await getDoc(doc(db, 'groups', id))
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setGroup(data)

        // 預設每人自訂金額為 0
        const init = {}
        data.members.forEach(uid => { init[uid] = '' })
        setCustomAmounts(init)
      }
    }
    fetchGroup()
  }, [id])

  // 自訂金額總和
  const customTotal = Object.values(customAmounts)
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

  // 驗證
  const isValid = () => {
    if (!title.trim()) return false
    if (!amount || parseFloat(amount) <= 0) return false
    if (splitType === 'custom') {
      const diff = Math.abs(customTotal - parseFloat(amount))
      if (diff > 0.01) return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!isValid()) return
    setLoading(true)

    try {
      const totalAmount = parseFloat(amount)
      const members = group.members

      // 計算每人應付金額
      let splits = {}
      if (splitType === 'equal') {
        const each = totalAmount / members.length
        members.forEach(uid => { splits[uid] = parseFloat(each.toFixed(2)) })
      } else {
        members.forEach(uid => {
          splits[uid] = parseFloat(customAmounts[uid]) || 0
        })
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

      navigate(`/group/${id}`)
    } catch (error) {
      console.error('新增失敗', error)
      setLoading(false)
    }
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        載入中...
      </div>
    )
  }

  const members = Object.entries(group.memberProfiles || {})

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
        <h1 className="font-bold text-gray-800 text-lg">新增支出</h1>
      </div>

      <div className="px-4 py-6 flex flex-col gap-4">

        {/* 選 Emoji */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-500 mb-3">類別</p>
          <div className="grid grid-cols-6 gap-2">
            {EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`text-2xl p-1 rounded-xl transition-all ${
                  emoji === e ? 'bg-green-100 scale-110' : 'hover:bg-gray-100'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* 名稱 & 金額 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-500 mb-2">項目名稱</p>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：晚餐、計程車..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 outline-none focus:border-green-400 transition-colors"
              maxLength={20}
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500 mb-2">金額</p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">NT$</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl pl-14 pr-4 py-3 text-gray-800 outline-none focus:border-green-400 transition-colors text-lg font-semibold"
              />
            </div>
          </div>
        </div>

        {/* 誰付錢 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-500 mb-3">誰付錢</p>
          <div className="flex flex-col gap-2">
            {members.map(([uid, profile]) => (
              <button
                key={uid}
                onClick={() => setPaidBy(uid)}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  paidBy === uid
                    ? 'bg-green-50 border border-green-300'
                    : 'border border-gray-100'
                }`}
              >
                <img
                  src={profile.avatar}
                  alt={profile.name}
                  className="w-8 h-8 rounded-full object-cover bg-gray-100"
                />
                <span className="text-gray-700 font-medium">{profile.name}</span>
                {paidBy === uid && (
                  <span className="ml-auto text-green-500">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 分帳方式 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-500 mb-3">分帳方式</p>
          <div className="flex gap-2 mb-4">
            {SPLIT_TYPES.map(type => (
              <button
                key={type.key}
                onClick={() => setSplitType(type.key)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                  splitType === type.key
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* 均分預覽 */}
          {splitType === 'equal' && amount && (
            <div className="flex flex-col gap-2">
              {members.map(([uid, profile]) => (
                <div key={uid} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src={profile.avatar}
                      alt={profile.name}
                      className="w-6 h-6 rounded-full object-cover bg-gray-100"
                    />
                    <span className="text-sm text-gray-600">{profile.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    NT$ {(parseFloat(amount) / members.length).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 自訂金額 */}
          {splitType === 'custom' && (
            <div className="flex flex-col gap-3">
              {members.map(([uid, profile]) => (
                <div key={uid} className="flex items-center gap-3">
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    className="w-6 h-6 rounded-full object-cover bg-gray-100"
                  />
                  <span className="text-sm text-gray-600 flex-1">{profile.name}</span>
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">NT$</span>
                    <input
                      type="number"
                      value={customAmounts[uid]}
                      onChange={e => setCustomAmounts(prev => ({
                        ...prev,
                        [uid]: e.target.value
                      }))}
                      className="w-full border border-gray-200 rounded-xl pl-10 pr-3 py-2 text-sm outline-none focus:border-green-400"
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}

              {/* 自訂金額驗證 */}
              <div className={`text-right text-sm font-semibold ${
                Math.abs(customTotal - (parseFloat(amount) || 0)) < 0.01
                  ? 'text-green-500'
                  : 'text-red-400'
              }`}>
                已分配 NT$ {customTotal.toFixed(0)} / {amount || 0}
              </div>
            </div>
          )}
        </div>

        {/* 送出按鈕 */}
        <button
          onClick={handleSubmit}
          disabled={!isValid() || loading}
          className={`w-full py-4 rounded-2xl font-bold text-white shadow transition-all ${
            isValid() && !loading
              ? 'bg-green-500 active:scale-95'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {loading ? '新增中...' : '✅ 確認新增'}
        </button>
      </div>
    </div>
  )
}

export default AddExpensePage