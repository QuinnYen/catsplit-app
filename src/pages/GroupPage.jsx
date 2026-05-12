import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, onSnapshot, orderBy, query, updateDoc, deleteDoc, increment } from 'firebase/firestore'

import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'

const DEFAULT_CATEGORIES = ['餐飲', '交通', '住宿', '購物', '娛樂', '日用品', '其他']

const GroupPage = () => {
  const { id } = useParams()
  const { user } = useApp()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  // 編輯消費 modal
  const [editingExpense, setEditingExpense] = useState(null) // expense object
  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editCustomCategory, setEditCustomCategory] = useState('')
  const [editIsCustomCategory, setEditIsCustomCategory] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'groups', id), (snap) => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() })
    })
    return () => unsubscribe()
  }, [id])

  useEffect(() => {
    const q = query(
      collection(db, 'groups', id, 'expenses'),
      orderBy('createdAt', 'desc')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setExpenses(data)
      setLoading(false)
    }, (error) => {
      console.error('Firestore 讀取失敗:', error)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [id])

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  // 開啟消費編輯 modal
  const openEditExpense = (expense) => {
    setEditingExpense(expense)
    setEditTitle(expense.title)
    setEditAmount(String(expense.amount))
    const isCustom = !DEFAULT_CATEGORIES.includes(expense.category)
    setEditIsCustomCategory(isCustom)
    setEditCategory(isCustom ? '' : (expense.category || '餐飲'))
    setEditCustomCategory(isCustom ? (expense.category || '') : '')
  }

  // 儲存消費編輯
  const handleSaveExpense = async () => {
    const newAmount = parseFloat(editAmount)
    if (!editTitle.trim() || isNaN(newAmount) || newAmount <= 0) return
    const finalCategory = editIsCustomCategory ? editCustomCategory : editCategory
    setEditSaving(true)
    try {
      const diff = newAmount - editingExpense.amount
      await updateDoc(doc(db, 'groups', id, 'expenses', editingExpense.id), {
        title: editTitle.trim(),
        category: finalCategory,
        amount: newAmount,
      })
      if (Math.abs(diff) > 0.001) {
        await updateDoc(doc(db, 'groups', id), {
          totalAmount: increment(diff),
        })
      }
      setEditingExpense(null)
    } catch (error) {
      console.error('編輯失敗', error)
    }
    setEditSaving(false)
  }

  // 刪除消費
  const handleDeleteExpense = async () => {
    if (!confirm(`確定刪除「${editingExpense.title}」？`)) return
    setEditSaving(true)
    try {
      await deleteDoc(doc(db, 'groups', id, 'expenses', editingExpense.id))
      await updateDoc(doc(db, 'groups', id), {
        totalAmount: increment(-editingExpense.amount),
        totalExpenses: increment(-1),
      })
      setEditingExpense(null)
    } catch (error) {
      console.error('刪除失敗', error)
    }
    setEditSaving(false)
  }

  const handleInvite = () => {
    const url = `${window.location.origin}/join/${id}`
    if (navigator.share) {
      navigator.share({ title: `加入「${group?.name}」分帳群組`, text: `${user?.name} 邀請你加入分帳群組！`, url })
    } else {
      navigator.clipboard.writeText(url)
      alert('邀請連結已複製！\n貼到 LINE 傳給朋友吧 😄')
    }
  }

  if (!group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        載入中...
      </div>
    )
  }

  const profiles = Object.values(group.memberProfiles || {})

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: 10, bottom: -10, fontSize: 64, opacity: 0.12, userSelect: 'none' }}>🐾</div>

        {/* 返回列 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 }}
          >
            ‹
          </button>

          <div style={{ flex: 1, color: '#fff', fontSize: 16, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
            <span>{group.emoji}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
          </div>

          <button
            onClick={handleInvite}
            style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 20, padding: '5px 12px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
          >
            邀請
          </button>
          <button
            onClick={() => navigate(`/group/${id}/edit`)}
            style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 20, padding: '5px 12px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
          >
            編輯
          </button>
        </div>

        {/* 成員頭像 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 14 }}>
          {profiles.map((member, i) => (
            <Avatar
              key={i}
              src={member.avatar}
              name={member.name}
              title={member.name}
              size={28}
              style={{ background: '#ffe0c8', border: '2px solid rgba(255,255,255,0.6)', marginLeft: i === 0 ? 0 : -6 }}
            />
          ))}
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 8 }}>
            {group.members?.length} 位成員
          </span>
        </div>

        {/* 總金額卡片 */}
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 14, border: '1px solid rgba(255,255,255,0.3)' }}>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginBottom: 4 }}>總支出</div>
          <div style={{ color: '#fff', fontSize: 24, fontWeight: 500 }}>
            NT$ {total.toLocaleString()}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 }}>
            共 {expenses.length} 筆消費
          </div>
        </div>
      </div>

      {/* 操作按鈕 */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => navigate(`/group/${id}/add`)}
            style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14, textAlign: 'center', cursor: 'pointer' }}
            onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div style={{ fontSize: 24, marginBottom: 4 }}>➕</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#3d2b1f' }}>新增支出</div>
          </button>
          <button
            onClick={() => navigate(`/group/${id}/settle`)}
            style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14, textAlign: 'center', cursor: 'pointer' }}
            onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div style={{ fontSize: 24, marginBottom: 4 }}>🧮</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#3d2b1f' }}>結算</div>
          </button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>消費明細</div>
      </div>

      {/* 支出列表 */}
      <div style={{ padding: '0 16px 80px', flex: 1 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#b08060' }}>載入中...</div>
        )}

        {!loading && expenses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
            <div style={{ color: '#b08060', fontSize: 14, marginBottom: 4 }}>還沒有任何支出</div>
            <div style={{ color: '#c4a882', fontSize: 13 }}>點上方新增第一筆吧！</div>
          </div>
        )}

        {!loading && expenses.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expenses.map(expense => (
              <div
                key={expense.id}
                style={{ background: '#fff', borderRadius: 14, border: '0.5px solid #f0d5c0', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div style={{ width: 40, height: 40, background: '#fff3ec', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: '#FF6B1A', flexShrink: 0, textAlign: 'center', padding: '0 4px' }}>
                  {expense.category || '其他'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {expense.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#b08060' }}>
                    {group.memberProfiles?.[expense.paidBy]?.name || '未知'} 付款
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#FF6B1A', flexShrink: 0 }}>
                  NT$ {expense.amount.toLocaleString()}
                </div>
                <button
                  onClick={() => openEditExpense(expense)}
                  style={{ background: '#fff3ec', border: 'none', borderRadius: 8, padding: '6px 8px', fontSize: 14, cursor: 'pointer', flexShrink: 0, color: '#FF8C42' }}
                >
                  ✏️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <TabBar context="group" groupId={id} />

      {/* 編輯消費 Modal */}
      {editingExpense && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
          onClick={e => e.target === e.currentTarget && setEditingExpense(null)}
        >
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', padding: '20px 16px 36px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Modal 標題 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#3d2b1f' }}>編輯消費</div>
              <button onClick={() => setEditingExpense(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#b08060', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* 類別 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>類別</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: editIsCustomCategory ? 8 : 0 }}>
                {DEFAULT_CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => { setEditCategory(c); setEditIsCustomCategory(false) }}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, border: 'none', cursor: 'pointer',
                      background: editCategory === c && !editIsCustomCategory ? '#FF8C42' : '#fff3ec',
                      color: editCategory === c && !editIsCustomCategory ? '#fff' : '#b08060',
                      fontWeight: editCategory === c && !editIsCustomCategory ? 500 : 400,
                    }}
                  >
                    {c}
                  </button>
                ))}
                <button
                  onClick={() => setEditIsCustomCategory(true)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, border: 'none', cursor: 'pointer',
                    background: editIsCustomCategory ? '#FF8C42' : '#fff3ec',
                    color: editIsCustomCategory ? '#fff' : '#b08060',
                  }}
                >
                  自訂
                </button>
              </div>
              {editIsCustomCategory && (
                <input
                  type="text"
                  value={editCustomCategory}
                  onChange={e => setEditCustomCategory(e.target.value)}
                  placeholder="輸入自訂類別..."
                  maxLength={10}
                  autoFocus
                  style={{ width: '100%', border: '0.5px solid #FF8C42', borderRadius: 10, padding: '9px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
                />
              )}
            </div>

            {/* 項目名稱 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>項目名稱</div>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                maxLength={20}
                style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
              />
            </div>

            {/* 金額 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>金額</div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#b08060', fontSize: 13 }}>NT$</span>
                <input
                  type="number"
                  value={editAmount}
                  onChange={e => setEditAmount(e.target.value)}
                  style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px 10px 44px', fontSize: 18, fontWeight: 500, color: '#FF6B1A', outline: 'none', background: '#fff8f4' }}
                />
              </div>
            </div>

            {/* 按鈕 */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleDeleteExpense}
                disabled={editSaving}
                style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid #f0d5c0', background: '#fff', color: '#e57373', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
              >
                刪除
              </button>
              <button
                onClick={handleSaveExpense}
                disabled={editSaving || !editTitle.trim() || !editAmount}
                style={{
                  flex: 2, padding: '13px 0', borderRadius: 14, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  background: editSaving || !editTitle.trim() || !editAmount ? '#e0c4b0' : '#FF8C42',
                  color: '#fff',
                }}
              >
                {editSaving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GroupPage
