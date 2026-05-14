import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, onSnapshot, orderBy, query, deleteDoc, getDocs, updateDoc, arrayUnion } from 'firebase/firestore'

import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'
import { getCurrency } from '../config/currencies'
import { computeMemberBalances } from '../utils/expenseHelpers'

const GroupPage = () => {
  const { id } = useParams()
  const { user } = useApp()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [joining, setJoining] = useState(false)

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

  useEffect(() => {
    const q = query(
      collection(db, 'groups', id, 'settlements'),
      orderBy('createdAt', 'desc')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setSettlements(data)
    })
    return () => unsubscribe()
  }, [id])

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('確定要刪除這筆支出嗎？')) return
    setOpenMenuId(null)
    try {
      await deleteDoc(doc(db, 'groups', id, 'expenses', expenseId))
      const [expSnap, setSnap] = await Promise.all([
        getDocs(collection(db, 'groups', id, 'expenses')),
        getDocs(collection(db, 'groups', id, 'settlements')),
      ])
      const memberBalances = computeMemberBalances(group.members, expSnap.docs, setSnap.docs)
      const totalAmount = expSnap.docs.reduce((sum, d) => sum + d.data().amount, 0)
      await updateDoc(doc(db, 'groups', id), { totalAmount, totalExpenses: expSnap.size, memberBalances })
    } catch (error) {
      console.error('刪除支出失敗', error)
    }
  }

  const handleDeleteSettlement = async (settlementId, groupSnapshot) => {
    if (!window.confirm('確定要刪除這筆轉帳紀錄嗎？')) return
    try {
      await deleteDoc(doc(db, 'groups', id, 'settlements', settlementId))

      const [expSnap, setSnap] = await Promise.all([
        getDocs(collection(db, 'groups', id, 'expenses')),
        getDocs(collection(db, 'groups', id, 'settlements')),
      ])

      const memberBalances = computeMemberBalances(groupSnapshot.members, expSnap.docs, setSnap.docs)
      await updateDoc(doc(db, 'groups', id), { memberBalances })
    } catch (error) {
      console.error('刪除轉帳失敗', error)
    }
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  const handleExportCSV = () => {
    const currencySymbol = getCurrency(group.baseCurrency).symbol
    const header = ['日期', '標題', '類別', '付款人', `原始金額`, '幣別', `換算金額(${group.baseCurrency})`, '分帳方式', '備註']
    const rows = [...expenses].reverse().map(e => {
      const date = e.createdAt?.toDate
        ? e.createdAt.toDate().toLocaleDateString('zh-TW')
        : ''
      const payer = group.memberProfiles?.[e.paidBy]?.name || e.paidBy
      const splitTypes = { equal: '均分', subset: '部分均分', shares: '份數', percentage: '百分比', custom: '自訂' }
      const splitType = splitTypes[e.splitType] || e.splitType || ''
      return [
        date,
        e.title || '',
        e.category || '',
        payer,
        e.originalAmount ?? e.amount,
        e.currency || group.baseCurrency,
        e.amount,
        splitType,
        e.note || '',
      ]
    })
    const bom = '﻿'
    const csv = bom + [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${group.name}_支出明細.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleInvite = () => {
    const liffId = import.meta.env.VITE_LIFF_ID
    const url = `https://liff.line.me/${liffId}/group/${id}`
    if (navigator.share) {
      navigator.share({ title: `${group?.emoji} ${group?.name}`, text: `${user?.name} 邀請你加入 CatSplit 分帳群組！`, url })
    } else {
      navigator.clipboard.writeText(url)
      alert('邀請連結已複製！\n貼到 LINE 傳給朋友吧 😄')
    }
  }

  const handleJoin = async () => {
    setJoining(true)
    try {
      await updateDoc(doc(db, 'groups', id), {
        members: arrayUnion(user.uid),
        [`memberProfiles.${user.uid}`]: { name: user.name, avatar: user.avatar },
      })
    } catch (error) {
      console.error('加入失敗', error)
      setJoining(false)
    }
  }

  if (!group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        載入中...
      </div>
    )
  }

  // 未加入成員 → 顯示加入畫面
  if (!group.members?.includes(user?.uid)) {
    const profiles = Object.values(group.memberProfiles || {})
    return (
      <div style={{ minHeight: '100vh', background: '#fff8f4', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 32px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: 10, bottom: -10, fontSize: 64, opacity: 0.12, userSelect: 'none' }}>🐾</div>
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>{group.emoji}</div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 500, marginBottom: 4 }}>{group.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>你被邀請加入這個群組！</div>
          </div>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>目前成員</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profiles.map((member, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar src={member.avatar} name={member.name} size={36} />
                  <div style={{ fontSize: 14, color: '#3d2b1f', fontWeight: 500 }}>{member.name}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>以此身份加入</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff3ec', borderRadius: 12, padding: '10px 12px' }}>
              <Avatar src={user?.avatar} name={user?.name} size={40} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f' }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: '#b08060', marginTop: 2 }}>LINE 帳號</div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#FF8C42', fontSize: 18 }}>✓</div>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', fontSize: 15, fontWeight: 500,
              cursor: joining ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              background: joining ? '#e0c4b0' : '#FF8C42', color: '#fff',
            }}
          >
            {joining ? '加入中...' : `🐱 加入「${group.name}」`}
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
            onClick={handleExportCSV}
            disabled={expenses.length === 0}
            style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 20, padding: '5px 12px', fontSize: 12, cursor: expenses.length === 0 ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: expenses.length === 0 ? 0.5 : 1 }}
          >
            匯出
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
            {getCurrency(group.baseCurrency).symbol} {total.toLocaleString()}
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#b08060' }}>消費明細</div>
          {activeCategory && (
            <button
              onClick={() => setActiveCategory(null)}
              style={{ fontSize: 11, color: '#FF8C42', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              清除篩選 ✕
            </button>
          )}
        </div>

        {/* 類別篩選 chips */}
        {!loading && expenses.length > 0 && (() => {
          const cats = ['全部', ...Array.from(new Set(expenses.map(e => e.category || '其他')))]
          return (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
              {cats.map(cat => {
                const isActive = cat === '全部' ? activeCategory === null : activeCategory === cat
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat === '全部' ? null : cat)}
                    style={{
                      flexShrink: 0, padding: '5px 12px', borderRadius: 20, fontSize: 12, border: 'none', cursor: 'pointer',
                      background: isActive ? '#FF8C42' : '#fff3ec',
                      color: isActive ? '#fff' : '#b08060',
                      fontWeight: isActive ? 500 : 400,
                    }}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* 支出列表 */}
      <div style={{ padding: '0 16px 80px', flex: 1 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#b08060' }}>載入中...</div>
        )}

        {!loading && expenses.length === 0 && settlements.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
            <div style={{ color: '#b08060', fontSize: 14, marginBottom: 4 }}>還沒有任何支出</div>
            <div style={{ color: '#c4a882', fontSize: 13 }}>點上方新增第一筆吧！</div>
          </div>
        )}

        {!loading && (() => {
          const filteredExpenses = activeCategory
            ? expenses.filter(e => (e.category || '其他') === activeCategory)
            : expenses

          if (activeCategory && filteredExpenses.length === 0) return (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
              <div style={{ color: '#b08060', fontSize: 14 }}>此類別沒有支出</div>
            </div>
          )

          // Merge expenses and settlements into unified timeline, sorted desc by createdAt
          const allItems = [
            ...filteredExpenses.map(e => ({ ...e, _type: 'expense' })),
            ...(activeCategory ? [] : settlements.map(s => ({ ...s, _type: 'settlement' }))),
          ].sort((a, b) => {
            const ta = a.createdAt?.toDate?.() ?? new Date(0)
            const tb = b.createdAt?.toDate?.() ?? new Date(0)
            return tb - ta
          })

          if (allItems.length === 0) return null

          const toDateLabel = (item) => item.createdAt?.toDate
            ? item.createdAt.toDate().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
            : '未知日期'

          const groups = []
          let currentDate = null
          allItems.forEach(item => {
            const dateLabel = toDateLabel(item)
            if (dateLabel !== currentDate) {
              currentDate = dateLabel
              groups.push({ date: dateLabel, items: [] })
            }
            groups[groups.length - 1].items.push(item)
          })

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {groups.map(({ date, items }) => (
                <div key={date}>
                  <div style={{ fontSize: 11, color: '#c4a882', fontWeight: 500, padding: '12px 0 6px', letterSpacing: '0.03em' }}>
                    {date}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(item => {
                      if (item._type === 'settlement') {
                        const from = group.memberProfiles?.[item.from]
                        const to = group.memberProfiles?.[item.to]
                        return (
                          <div
                            key={item.id}
                            style={{ background: '#f0faf0', borderRadius: 14, border: '0.5px solid #c8e6c9', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
                          >
                            <div style={{ width: 40, height: 40, background: '#e8f5e9', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                              💸
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: '#2e7d32', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {from?.name} 轉給 {to?.name}
                              </div>
                              <div style={{ fontSize: 11, color: '#66bb6a' }}>
                                {item.paymentMethod}{item.note ? ` · ${item.note}` : ''}
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div style={{ fontSize: 15, fontWeight: 500, color: '#2e7d32' }}>
                                {getCurrency(item.currency || group.baseCurrency).symbol} {item.amount.toLocaleString()}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteSettlement(item.id, group)}
                              style={{ background: '#ffebee', border: 'none', borderRadius: 8, padding: '6px 8px', fontSize: 14, cursor: 'pointer', flexShrink: 0, color: '#e53935' }}
                            >
                              🗑️
                            </button>
                          </div>
                        )
                      }

                      const isMenuOpen = openMenuId === item.id
                      return (
                        <div key={item.id} style={{ position: 'relative' }}>
                          <div
                            onClick={() => navigate(`/group/${id}/expense/${item.id}`)}
                            style={{ background: '#fff', borderRadius: 14, border: '0.5px solid #f0d5c0', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                            onTouchStart={e => e.currentTarget.style.opacity = '0.75'}
                            onTouchEnd={e => e.currentTarget.style.opacity = '1'}
                          >
                            <div style={{ width: 40, height: 40, background: '#fff3ec', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: '#FF6B1A', flexShrink: 0, textAlign: 'center', padding: '0 4px' }}>
                              {item.category || '其他'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.title}
                              </div>
                              <div style={{ fontSize: 12, color: '#b08060' }}>
                                {group.memberProfiles?.[item.paidBy]?.name || '未知'} 付款
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div style={{ fontSize: 15, fontWeight: 500, color: '#FF6B1A' }}>
                                {getCurrency(item.currency || group.baseCurrency).symbol} {(item.originalAmount ?? item.amount).toLocaleString()}
                              </div>
                              {item.currency && item.currency !== (group.baseCurrency || 'TWD') && (
                                <div style={{ fontSize: 11, color: '#c4a882', marginTop: 1 }}>
                                  ≈ {getCurrency(group.baseCurrency).symbol} {item.amount.toLocaleString()}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : item.id) }}
                              style={{ background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer', fontSize: 18, color: '#c4a882', flexShrink: 0, lineHeight: 1 }}
                            >
                              ⋮
                            </button>
                          </div>

                          {/* 下拉選單 */}
                          {isMenuOpen && (
                            <>
                              {/* 遮罩，點外面關閉 */}
                              <div
                                onClick={() => setOpenMenuId(null)}
                                style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                              />
                              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 11, background: '#fff', borderRadius: 12, border: '0.5px solid #f0d5c0', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', overflow: 'hidden', minWidth: 120 }}>
                                <button
                                  onClick={e => { e.stopPropagation(); setOpenMenuId(null); navigate(`/group/${id}/expense/${item.id}/edit`) }}
                                  style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, color: '#3d2b1f', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                                >
                                  ✏️ 編輯
                                </button>
                                <div style={{ height: '0.5px', background: '#f0d5c0' }} />
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteExpense(item.id) }}
                                  style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, color: '#e53935', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                                >
                                  🗑️ 刪除
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      <TabBar context="group" groupId={id} />
    </div>
  )
}

export default GroupPage
