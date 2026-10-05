// /group/:id — 群組首頁：總支出、依時間排列的支出與轉帳紀錄（可搜尋、依類別篩選）；訪客從邀請連結進來時也在此選名字加入。
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, onSnapshot, orderBy, query, deleteDoc, getDocs, updateDoc, arrayUnion } from 'firebase/firestore'

import { Check, X, Receipt, Search, Trash2, Pencil, MoreVertical, ChevronRight } from 'lucide-react'
import { db, auth } from '../config/firebase'
import { useApp } from '../context/AppContext'
import GuestJoin from '../components/GuestJoin'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'
import GroupIcon from '../components/GroupIcon'
import PawDecor from '../components/PawDecor'
import { getCurrency } from '../config/currencies'
import { computeMemberBalances, computeMemberExpenseCounts, matchExpense, payerLabel, expenseTimeStr } from '../utils/expenseHelpers'
import { deleteFileByPath } from '../utils/storageCleanup'

const EXPORT_CSV_URL = import.meta.env.VITE_TOKEN_EXCHANGE_URL?.replace('/lineLogin', '/exportCsv')

const GroupPage = () => {
  const { id } = useParams()
  const { user, claimMember, liffInstance } = useApp()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuUp, setMenuUp] = useState(false)
  const [detailSettlementId, setDetailSettlementId] = useState(null)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [groupMissing, setGroupMissing] = useState(false)
  const [loadedCover, setLoadedCover] = useState(null)

  const [isMember, setIsMember] = useState(false)

  useEffect(() => {
    // includeMetadataChanges：伺服器確認寫入時資料沒變，預設不會再觸發，isMember 就卡在 false
    const unsubscribe = onSnapshot(doc(db, 'groups', id), { includeMetadataChanges: true }, (snap) => {
      setGroupMissing(!snap.exists())
      if (!snap.exists()) return
      const data = snap.data()
      setGroup({ id: snap.id, ...data })
      // 子集合只有成員讀得到；非成員時先不訂閱，否則被拒絕的監聽器不會在加入後自動恢復。
      // 加入時本地快照會先於伺服器確認就出現新成員身分，此時訂閱會被規則拒絕，
      // 所以寫入未確認前沿用先前的判斷，等伺服器確認後才開始訂閱
      const member = !!data.members?.includes(user?.uid)
      setIsMember(prev => (snap.metadata.hasPendingWrites ? prev : member))
    }, (error) => {
      console.error('讀取群組失敗:', error)
      setGroupMissing(true)
    })
    return () => unsubscribe()
  }, [id, user?.uid])

  useEffect(() => {
    if (!isMember) return
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
  }, [id, isMember])

  useEffect(() => {
    if (!isMember) return
    const q = query(
      collection(db, 'groups', id, 'settlements'),
      orderBy('createdAt', 'desc')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setSettlements(data)
    }, (error) => {
      console.error('讀取轉帳紀錄失敗:', error)
    })
    return () => unsubscribe()
  }, [id, isMember])

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('確定要刪除這筆支出嗎？')) return
    setOpenMenuId(null)
    try {
      const receiptPath = expenses.find(e => e.id === expenseId)?.receiptPath
      await deleteDoc(doc(db, 'groups', id, 'expenses', expenseId))
      await deleteFileByPath(receiptPath)
      const [expSnap, setSnap] = await Promise.all([
        getDocs(collection(db, 'groups', id, 'expenses')),
        getDocs(collection(db, 'groups', id, 'settlements')),
      ])
      const memberBalances = computeMemberBalances(group.members, expSnap.docs, setSnap.docs)
      const totalAmount = expSnap.docs.reduce((sum, d) => sum + d.data().amount, 0)
      const memberExpenseCounts = computeMemberExpenseCounts(expSnap.docs)
      await updateDoc(doc(db, 'groups', id), { totalAmount, totalExpenses: expSnap.size, memberBalances, memberExpenseCounts })
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

  const handleExportCSV = async () => {
    const header = ['日期', '標題', '類別', '付款人', `原始金額`, '幣別', `換算金額(${group.baseCurrency})`, '分帳方式', '備註']
    const rows = [...expenses].reverse().map(e => {
      const date = e.createdAt?.toDate
        ? e.createdAt.toDate().toLocaleDateString('zh-TW')
        : ''
      const payer = Object.entries(e.payments || {})
        .map(([uid, amt]) => `${group.memberProfiles?.[uid]?.name || uid}(${amt})`)
        .join('; ')
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
    // 文字欄位以 = + - @ 開頭時，Excel 會當公式執行；前面補 ' 使其視為純文字（數字不處理）
    const escapeCell = v => {
      const s = String(v)
      return `"${(typeof v === 'string' && /^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`
    }
    const csv = bom + [header, ...rows].map(r => r.map(escapeCell).join(',')).join('\n')
    const filename = `${group.name}_支出明細.csv`

    // LINE 內建瀏覽器無法下載 blob：請雲端函式存檔並回傳短效網址，在外部瀏覽器開啟下載
    if (liffInstance?.isInClient?.() && EXPORT_CSV_URL) {
      try {
        const idToken = await auth.currentUser.getIdToken()
        const res = await fetch(EXPORT_CSV_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ groupId: id, csv, filename }),
        })
        if (!res.ok) throw new Error(`exportCsv ${res.status}`)
        const { url } = await res.json()
        liffInstance.openWindow({ url, external: true })
      } catch (e) {
        console.error('匯出失敗', e)
        alert('匯出失敗，請稍後再試')
      }
      return
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // 邀請：LINE 內用好友選擇器 → 支援的瀏覽器用系統分享選單 → 最後複製連結
  const handleInvite = async () => {
    const liffId = import.meta.env.VITE_LIFF_ID
    const url = `https://liff.line.me/${liffId}/group/${id}`
    const text = `${user?.name} 邀請你加入 貓咪分帳 CatSplit 的分帳群組「${group?.name}」！`
    try {
      if (liffInstance?.isApiAvailable?.('shareTargetPicker')) {
        await liffInstance.shareTargetPicker([{ type: 'text', text: `${text}\n${url}` }])
        return
      }
    } catch (e) {
      console.warn('shareTargetPicker 失敗', e)
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: group?.name, text, url })
        return
      }
    } catch (e) {
      if (e.name === 'AbortError') return // 使用者取消分享
      console.warn('navigator.share 失敗', e)
    }
    try {
      await navigator.clipboard.writeText(url)
      alert('邀請連結已複製！\n貼到 LINE 傳給朋友吧')
    } catch {
      prompt('請複製這個邀請連結', url)
    }
  }

  // LINE 使用者認領訪客名字：之後這個名字只有本人能用
  const handleClaim = async (placeholderId) => {
    const name = group.memberProfiles?.[placeholderId]?.name
    if (!window.confirm(`確定你就是「${name}」嗎？
認領後，這個名字底下的帳目都會算在你的 LINE 帳號，其他人就不能再選這個名字。`)) return
    setJoining(true)
    setJoinError('')
    try {
      await claimMember(id, placeholderId)
    } catch (error) {
      console.error('認領失敗', error)
      setJoinError('認領失敗，可能已被其他人認領，請重新整理後再試')
      setJoining(false)
    }
  }

  const handleJoin = async () => {
    setJoining(true)
    setJoinError('')
    try {
      await updateDoc(doc(db, 'groups', id), {
        members: arrayUnion(user.uid),
        [`memberProfiles.${user.uid}`]: { name: user.name, avatar: user.avatar ?? null },
      })
    } catch (error) {
      console.error('加入失敗', error)
      setJoinError(error?.code === 'permission-denied'
        ? '無法加入：群組可能已滿 50 人，或邀請連結已失效'
        : '加入失敗，請稍後再試')
      setJoining(false)
    }
  }

  if (groupMissing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060', gap: 16, padding: 24, textAlign: 'center' }}>
        <div>找不到這個群組，可能已被刪除，或連結有誤</div>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '10px 24px', borderRadius: 12, border: '0.5px solid #f0d5c0', background: '#fff', color: '#3d2b1f', fontSize: 14, cursor: 'pointer' }}
        >
          回首頁
        </button>
      </div>
    )
  }

  if (!group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        載入中...
      </div>
    )
  }

  // 未加入成員 → 顯示加入畫面
  if (!isMember) {
    const profiles = Object.values(group.memberProfiles || {})
    const placeholders = (group.members || []).filter(m => group.memberProfiles?.[m]?.placeholder)
    return (
      <div style={{ minHeight: '100vh', background: '#fff8f4', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 32px', position: 'relative', overflow: 'hidden' }}>
          <PawDecor />
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <GroupIcon icon={group.icon} color={group.iconColor} size={72} onDark />
            </div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 500, marginBottom: 4 }}>{group.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>你被邀請加入這個群組！</div>
          </div>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>目前成員</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profiles.slice(0, 3).map((member, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar src={member.avatar} name={member.name} size={36} />
                  <div style={{ fontSize: 14, color: '#3d2b1f', fontWeight: 500 }}>{member.name}</div>
                </div>
              ))}
              {(group.members?.length || 0) > 3 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f0d5c0', color: '#b08060', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    +{group.members.length - 3}
                  </div>
                  <div style={{ fontSize: 14, color: '#b08060' }}>位成員</div>
                </div>
              )}
            </div>
          </div>
          {!user.guest && <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>以此身份加入</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff3ec', borderRadius: 12, padding: '10px 12px' }}>
              <Avatar src={user?.avatar} name={user?.name} size={40} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f' }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: '#b08060', marginTop: 2 }}>LINE 帳號</div>
              </div>
              <Check size={18} color="#FF8C42" strokeWidth={3} style={{ marginLeft: 'auto', flexShrink: 0 }} />
            </div>
          </div>}
          {/* 訪客（已在其他群組用訪客名字）：輸入新名字或選既有名字 */}
          {user.guest && (
            <GuestJoin groupId={id} guests={placeholders.map(pid => ({ id: pid, name: group.memberProfiles[pid].name }))} />
          )}
          {!user.guest && placeholders.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 4 }}>或者，你是下面其中一位嗎？</div>
              <div style={{ fontSize: 11, color: '#c4a882', marginBottom: 10 }}>群組已經幫你記了帳，認領後就能接手這個名字</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {placeholders.map(pid => (
                  <button
                    key={pid}
                    onClick={() => handleClaim(pid)}
                    disabled={joining}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff3ec', border: 'none', borderRadius: 12, padding: '10px 12px', cursor: joining ? 'not-allowed' : 'pointer', textAlign: 'left' }}
                  >
                    <Avatar src={null} name={group.memberProfiles[pid].name} size={36} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#3d2b1f' }}>{group.memberProfiles[pid].name}</span>
                    <span style={{ fontSize: 12, color: '#FF8C42' }}>我是他</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ flex: 1 }} />
          {joinError && (
            <div style={{ fontSize: 13, color: '#c0392b', textAlign: 'center' }}>{joinError}</div>
          )}
          {!user.guest && <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', fontSize: 15, fontWeight: 500,
              cursor: joining ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              background: joining ? '#e0c4b0' : '#FF8C42', color: '#fff',
            }}
          >
            {joining ? '處理中...' : placeholders.length > 0 ? `以新成員加入「${group.name}」` : `加入「${group.name}」`}
          </button>}
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
  // 從即時清單取值，刪除後會自動變成 undefined 而關閉彈窗
  const detailSettlement = settlements.find(s => s.id === detailSettlementId)

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)',
        padding: '16px 16px 24px', position: 'relative', overflow: 'hidden', fontWeight: 700, isolation: 'isolate',
      }}>
        {group.coverUrl ? (
          <>
            <img
              ref={el => { if (el?.complete && el.naturalWidth) setLoadedCover(group.coverUrl) }}
              src={group.coverUrl}
              alt=""
              onLoad={() => setLoadedCover(group.coverUrl)}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -2,
                opacity: loadedCover === group.coverUrl ? 1 : 0, transition: 'opacity 0.25s',
              }}
            />
            <div style={{ position: 'absolute', inset: 0, zIndex: -1, background: 'linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.5))' }} />
          </>
        ) : (
          <PawDecor />
        )}

        {/* 返回列 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 }}
          >
            ‹
          </button>

          <div style={{ flex: 1, color: '#fff', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
            <GroupIcon icon={group.icon} color={group.iconColor} size={28} onDark />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
          </div>

          <button
            onClick={handleInvite}
            style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
          >
            邀請
          </button>
          <button
            onClick={handleExportCSV}
            disabled={expenses.length === 0}
            style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: expenses.length === 0 ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: expenses.length === 0 ? 0.5 : 1 }}
          >
            匯出
          </button>
          <button
            onClick={() => navigate(`/group/${id}/edit`)}
            style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
          >
            編輯
          </button>
        </div>

        {/* 成員頭像 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 14 }}>
          {profiles.slice(0, 6).map((member, i) => (
            <Avatar
              key={i}
              src={member.avatar}
              name={member.name}
              title={member.name}
              size={28}
              style={{ background: '#ffe0c8', border: '2px solid rgba(255,255,255,0.6)', marginLeft: i === 0 ? 0 : -6 }}
            />
          ))}
          {(group.members?.length || 0) > 6 && (
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.6)', marginLeft: -6, background: '#ffe0c8', color: '#b08060', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
              +{group.members.length - 6}
            </div>
          )}
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 8 }}>
            {group.members?.length} 位成員
          </span>
        </div>

        {/* 總金額卡片 */}
        <div
          onClick={() => navigate(`/group/${id}/stats`)}
          style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 14, border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          onTouchStart={e => e.currentTarget.style.opacity = '0.75'}
          onTouchEnd={e => e.currentTarget.style.opacity = '1'}
        >
          <div style={{ flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginBottom: 4 }}>總支出</div>
            <div style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>
              {getCurrency(group.baseCurrency).symbol} {total.toLocaleString()}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 }}>
              共 {expenses.length} 筆消費
            </div>
          </div>
          <ChevronRight size={22} color="rgba(255,255,255,0.8)" style={{ flexShrink: 0 }} />
        </div>
      </div>

      {/* 操作按鈕 */}
      <div style={{ padding: '16px 16px 0' }}>
        {searchOpen ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '0.5px solid #f0d5c0', borderRadius: 20, padding: '6px 12px', marginBottom: 8 }}>
            <Search size={14} color="#b08060" style={{ flexShrink: 0 }} />
            <input
              autoFocus
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="搜尋標題、備註、類別、付款人、金額"
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: '#3d2b1f' }}
            />
            <button
              onClick={() => { setSearchOpen(false); setSearchText('') }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#b08060', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#b08060' }}>消費明細</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {activeCategory && (
                <button
                  onClick={() => setActiveCategory(null)}
                  style={{ fontSize: 11, color: '#FF8C42', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  清除篩選 <X size={11} strokeWidth={3} />
                </button>
              )}
              <button
                onClick={() => setSearchOpen(true)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#b08060', display: 'flex', alignItems: 'center' }}
              >
                <Search size={16} />
              </button>
            </div>
          </div>
        )}

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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Receipt size={48} color="#e0c4b0" /></div>
            <div style={{ color: '#b08060', fontSize: 14, marginBottom: 4 }}>還沒有任何支出</div>
            <div style={{ color: '#c4a882', fontSize: 13 }}>點上方新增第一筆吧！</div>
          </div>
        )}

        {!loading && (() => {
          const isSearching = searchText.trim() !== ''
          const filteredExpenses = expenses.filter(e =>
            (!activeCategory || (e.category || '其他') === activeCategory) &&
            matchExpense(e, searchText, group.memberProfiles)
          )

          if ((activeCategory || isSearching) && filteredExpenses.length === 0) return (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Search size={40} color="#e0c4b0" /></div>
              <div style={{ color: '#b08060', fontSize: 14 }}>{isSearching ? '找不到符合的支出' : '此類別沒有支出'}</div>
            </div>
          )

          // Merge expenses and settlements into unified timeline: by date (createdAt) desc,
          // then within the same day by time desc: 有 hasTime 的支出用消費時間（createdAt），
          // 其餘（舊支出、轉帳）用實際記帳時間（addedAt，退回 createdAt）
          const dayKey = (item) => {
            const d = item.createdAt?.toDate?.()
            return d ? d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() : 0
          }
          // addedAt 為 null 代表剛寫入、伺服器時間尚未回填，視為最新
          const sortTime = (item) => item.hasTime
            ? (item.createdAt?.toMillis?.() ?? 0)
            : item.addedAt === null
              ? Infinity
              : (item.addedAt?.toMillis?.() ?? item.createdAt?.toMillis?.() ?? 0)
          const allItems = [
            ...filteredExpenses.map(e => ({ ...e, _type: 'expense' })),
            ...(activeCategory || isSearching ? [] : settlements.map(s => ({ ...s, _type: 'settlement' }))),
          ].sort((a, b) => dayKey(b) - dayKey(a) || sortTime(b) - sortTime(a))

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
                            onClick={() => setDetailSettlementId(item.id)}
                            style={{ background: '#f0faf0', borderRadius: 14, border: '0.5px solid #c8e6c9', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', fontSize: 13, fontWeight: 500, color: '#2e7d32', marginBottom: 2 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from?.name}</span>
                                <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>&nbsp;轉給</span>
                              </div>
                              <div style={{ display: 'flex', fontSize: 13, fontWeight: 500, color: '#2e7d32' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to?.name}</span>
                                {item.paymentMethod && (
                                  <span style={{ flexShrink: 0, whiteSpace: 'nowrap', marginLeft: 6, fontSize: 11, fontWeight: 400, color: '#66bb6a' }}>
                                    {item.paymentMethod}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div style={{ fontSize: 15, fontWeight: 500, color: '#2e7d32' }}>
                                {getCurrency(item.currency || group.baseCurrency).symbol} {item.amount.toLocaleString()}
                              </div>
                            </div>
                            <ChevronRight size={16} color="#66bb6a" style={{ flexShrink: 0 }} />
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
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                                <span style={{ fontSize: 12, fontWeight: 500, color: '#FF6B1A', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                  {item.category || '其他'}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.title}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: '#b08060', display: 'flex' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {payerLabel(item.payments, group.memberProfiles)}
                                </span>
                                <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>&nbsp;付款{expenseTimeStr(item) && ` · ${expenseTimeStr(item)}`}</span>
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
                              onClick={e => {
                                e.stopPropagation()
                                // 選單約 90px 高，下方（含底部導覽列）空間不足就往上展開
                                setMenuUp(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom < 190)
                                setOpenMenuId(isMenuOpen ? null : item.id)
                              }}
                              style={{ background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer', color: '#c4a882', flexShrink: 0, display: 'flex', alignItems: 'center' }}
                            >
                              <MoreVertical size={18} />
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
                              <div style={{ position: 'absolute', ...(menuUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }), right: 0, zIndex: 11, background: '#fff', borderRadius: 12, border: '0.5px solid #f0d5c0', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', overflow: 'hidden', minWidth: 120 }}>
                                <button
                                  onClick={e => { e.stopPropagation(); setOpenMenuId(null); navigate(`/group/${id}/expense/${item.id}/edit`) }}
                                  style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, color: '#3d2b1f', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                                >
                                  <Pencil size={14} /> 編輯
                                </button>
                                <div style={{ height: '0.5px', background: '#f0d5c0' }} />
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteExpense(item.id) }}
                                  style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, color: '#e53935', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                                >
                                  <Trash2 size={14} /> 刪除
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

      {detailSettlement && (
        <div
          onClick={() => setDetailSettlementId(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 28 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#3d2b1f' }}>轉帳明細</div>
              <button
                onClick={() => setDetailSettlementId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                <X size={20} color="#b08060" />
              </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 500, color: '#2e7d32', marginBottom: 16 }}>
              {getCurrency(detailSettlement.currency || group.baseCurrency).symbol} {detailSettlement.amount.toLocaleString()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {[
                ['付款方', group.memberProfiles?.[detailSettlement.from]?.name],
                ['收款方', group.memberProfiles?.[detailSettlement.to]?.name],
                ['付款方式', detailSettlement.paymentMethod],
                ['備註', detailSettlement.note],
                ['轉帳時間', detailSettlement.createdAt?.toDate?.().toLocaleString('zh-TW')],
                ['記錄人', group.memberProfiles?.[detailSettlement.settledBy]?.name],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                  <div style={{ width: 64, flexShrink: 0, color: '#b08060' }}>{label}</div>
                  <div style={{ flex: 1, minWidth: 0, color: '#3d2b1f', wordBreak: 'break-word' }}>{value}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleDeleteSettlement(detailSettlement.id, group)}
              style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: '1px solid #ffcdd2', background: '#fff', color: '#e57373', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Trash2 size={14} /> 刪除這筆轉帳
            </button>
          </div>
        </div>
      )}

      <TabBar context="group" groupId={id} />
    </div>
  )
}

export default GroupPage
