import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'

const EMOJIS = ['🐱', '🐶', '🐻', '🦊', '🐼', '🐨', '🦁', '🐯', '🍕', '🍜', '🍣', '🏕️', '✈️', '🎮', '🎉', '💰']

const CreateGroupPage = () => {
  const { user } = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🐱')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)

    try {
      const docRef = await addDoc(collection(db, 'groups'), {
        name: name.trim(),
        emoji,
        createdBy: user.uid,
        members: [user.uid],
        memberProfiles: {
          [user.uid]: {
            name: user.name,
            avatar: user.avatar,
          }
        },
        createdAt: serverTimestamp(),
      })

      navigate(`/group/${docRef.id}`)
    } catch (error) {
      console.error('建立失敗', error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-500 text-xl"
        >
          ‹
        </button>
        <h1 className="font-bold text-gray-800 text-lg">建立新群組</h1>
      </div>

      <div className="px-4 py-6 flex flex-col gap-6">
        {/* 選 Emoji */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-500 mb-3">選擇圖示</p>
          <div className="grid grid-cols-8 gap-2">
            {EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`text-2xl p-1 rounded-xl transition-all ${
                  emoji === e
                    ? 'bg-green-100 scale-110'
                    : 'hover:bg-gray-100'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* 群組名稱 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-500 mb-3">群組名稱</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：墾丁之旅、每週聚餐..."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 outline-none focus:border-green-400 transition-colors"
            maxLength={20}
          />
          <p className="text-xs text-gray-300 text-right mt-1">{name.length} / 20</p>
        </div>

        {/* 預覽 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-500 mb-3">預覽</p>
          <div className="flex items-center gap-3">
            <div className="text-3xl">{emoji}</div>
            <div>
              <p className="font-semibold text-gray-800">
                {name || '群組名稱'}
              </p>
              <p className="text-xs text-gray-400">1 位成員</p>
            </div>
          </div>
        </div>

        {/* 建立按鈕 */}
        <button
          onClick={handleCreate}
          disabled={!name.trim() || loading}
          className={`w-full py-4 rounded-2xl font-bold text-white shadow transition-all ${
            name.trim() && !loading
              ? 'bg-green-500 active:scale-95'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {loading ? '建立中...' : '🐱 建立群組'}
        </button>
      </div>
    </div>
  )
}

export default CreateGroupPage