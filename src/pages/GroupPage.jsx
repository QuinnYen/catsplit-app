// /group/:id — 群組首頁：總支出、依時間排列的支出與轉帳紀錄（可搜尋、依類別篩選）；訪客從邀請連結進來時也在此選名字加入。
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, onSnapshot, orderBy, query, where, limit, getDocs, Timestamp, deleteDoc, updateDoc, arrayUnion } from 'firebase/firestore'

import { Check, X, Receipt, Search, Trash2, Pencil, MoreVertical, ChevronRight, Settings, UserPlus, Download, Users } from 'lucide-react'
import { db, auth } from '../config/firebase'
import { OFFICIAL_ACCOUNT_URL } from '../config/liff'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import { normalizeCategory, categoryLabel, paymentMethodLabel } from '../i18n/codes'
import { EMPTY_FILTERS, isFiltering, applyFilters } from '../utils/searchFilter'
import GuestJoin from '../components/GuestJoin'
import InviteModal from '../components/InviteModal'
import { buildShareContent } from '../utils/shareContent'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'
import SearchSheet from '../components/SearchSheet'
import MonthPicker from '../components/MonthPicker'
import { spendTypeBg } from '../utils/spendMethods'
import LineIcon from '../components/LineIcon'
import GroupIcon from '../components/GroupIcon'
import { getCurrency } from '../config/currencies'
import { payerLabel, expenseTimeStr } from '../utils/expenseHelpers'
import { buildCsv, csvFileName } from '../utils/csvExport'
import { deleteFileByPath } from '../utils/storageCleanup'
import { recomputeGroupAggregates } from '../utils/groupAggregates'
import { computeBudgetStatus } from '../utils/budget'
import { toMonthKey, monthRange, shiftMonth, latestMonthKey, summarizeLoaded } from '../utils/monthRange'

const EXPORT_CSV_URL = import.meta.env.VITE_TOKEN_EXCHANGE_URL?.replace('/lineLogin', '/exportCsv')

const GroupPage = () => {
  const { id } = useParams()
  const { user, claimMember, liffInstance } = useApp()
  const { t, fmt, lang } = useI18n()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [settlements, setSettlements] = useState([])
  const [incomes, setIncomes] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthKey, setMonthKey] = useState(null) // 'YYYY-MM'；null 表示還在找最近有帳的月份
  const [allMode, setAllMode] = useState(false)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [groupHasItems, setGroupHasItems] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuUp, setMenuUp] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [settingsPos, setSettingsPos] = useState(null)
  const [detailSettlementId, setDetailSettlementId] = useState(null)
  const [joining, setJoining] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [groupMissing, setGroupMissing] = useState(false)
  const [loadedCover, setLoadedCover] = useState(null)

  const [isMember, setIsMember] = useState(false)
  // 群組有預先建好的名字時，先讓人選「我是誰」；選了「不在名單內」才以新成員加入
  const [joinAsNew, setJoinAsNew] = useState(false)
  // 訪客沒經過 LINE 授權，看不到加好友提示；在 LINE 內用提示條補上，關掉後不再顯示
  const [oaBannerHidden, setOaBannerHidden] = useState(() => {
    try { return localStorage.getItem('catsplit_oa_banner_hidden') === '1' } catch { return false }
  })
  const hideOaBanner = () => {
    setOaBannerHidden(true)
    try { localStorage.setItem('catsplit_oa_banner_hidden', '1') } catch { /* 無法儲存就只在這次隱藏 */ }
  }
  const showOaBanner = !!user?.guest && !oaBannerHidden && (() => { try { return liffInstance?.isInClient() ?? false } catch { return false } })()

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
      console.error('Failed to load group:', error)
      setGroupMissing(true)
    })
    return () => unsubscribe()
  }, [id, user?.uid])

  // 明細依月份載入：預設是最近有帳的月份；按「全部」、開搜尋或套用篩選時才載入全部
  const loadAll = allMode || searchOpen || isFiltering(filters)
  const rangeKey = loadAll ? 'all' : monthKey

  useEffect(() => {
    if (!isMember) return
    let cancelled = false
    const latest = (col) => getDocs(query(collection(db, 'groups', id, col), orderBy('createdAt', 'desc'), limit(1)))
    Promise.all([latest('expenses'), latest('incomes'), latest('settlements')]).then(snaps => {
      if (cancelled) return
      setGroupHasItems(snaps.some(sn => !sn.empty))
      const millis = snaps.flatMap(sn => sn.docs.map(d => d.data().createdAt?.toMillis?.() ?? 0)).filter(Boolean)
      setMonthKey(latestMonthKey(millis, Date.now()))
    }).catch(error => {
      console.error('Failed to find latest month:', error)
      if (!cancelled) setMonthKey(toMonthKey(new Date()))
    })
    return () => { cancelled = true }
  }, [id, isMember])

  useEffect(() => {
    if (!isMember || !rangeKey) return
    const rangeQuery = (col) => {
      const base = collection(db, 'groups', id, col)
      if (rangeKey === 'all') return query(base, orderBy('createdAt', 'desc'))
      const { start, end } = monthRange(rangeKey)
      return query(base, where('createdAt', '>=', Timestamp.fromDate(start)), where('createdAt', '<', Timestamp.fromDate(end)), orderBy('createdAt', 'desc'))
    }
    const toList = (snapshot) => snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    const unsubs = [
      onSnapshot(rangeQuery('expenses'), (snapshot) => {
        setExpenses(toList(snapshot))
        setLoading(false)
      }, (error) => {
        console.error('Failed to load expenses:', error)
        setLoading(false)
      }),
      onSnapshot(rangeQuery('settlements'), (snapshot) => setSettlements(toList(snapshot)), (error) => {
        console.error('Failed to load settlements:', error)
      }),
      onSnapshot(rangeQuery('incomes'), (snapshot) => setIncomes(toList(snapshot)), (error) => {
        console.error('Failed to load incomes:', error)
      }),
    ]
    return () => unsubs.forEach(unsub => unsub())
  }, [id, isMember, rangeKey])

  const selectMonth = (key) => {
    if (!allMode && key === monthKey) return
    setLoading(true)
    setAllMode(false)
    setMonthKey(key)
  }
  const toggleAll = () => {
    setLoading(true)
    setAllMode(a => !a)
  }

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm(t('group.confirmDeleteExpense'))) return
    setOpenMenuId(null)
    try {
      const { receiptPath } = expenses.find(e => e.id === expenseId) ?? {}
      await deleteDoc(doc(db, 'groups', id, 'expenses', expenseId))
      await deleteFileByPath(receiptPath)
      await recomputeGroupAggregates(id, group.members)
    } catch (error) {
      console.error('Failed to delete expense', error)
    }
  }

  const handleDeleteSettlement = async (settlementId, groupSnapshot) => {
    if (!window.confirm(t('group.confirmDeleteSettlement'))) return
    try {
      await deleteDoc(doc(db, 'groups', id, 'settlements', settlementId))
      await recomputeGroupAggregates(id, groupSnapshot.members)
    } catch (error) {
      console.error('Failed to delete settlement', error)
    }
  }

  // 總額卡與預算讀群組彙總（不受月份影響；贊助不進總收入與預算）
  const total = group?.totalAmount ?? 0
  const incomeTotal = group?.totalIncome ?? 0
  const budget = computeBudgetStatus(group?.budget, { totalAmount: total, totalIncome: incomeTotal })

  const handleExportCSV = async () => {
    if (exporting) return
    // 畫面上只載入部分月份，匯出要抓全部帳目
    setExporting(true)
    let csv, filename
    try {
      const [expSnap, setSnap, incSnap] = await Promise.all(['expenses', 'settlements', 'incomes'].map(col => getDocs(collection(db, 'groups', id, col))))
      const toList = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const allIncomes = toList(incSnap)
      const allSettlements = toList(setSnap)
      csv = buildCsv({ expenses: toList(expSnap), incomes: allIncomes, settlements: allSettlements, group, uid: user?.uid, t })
      filename = csvFileName({ group, incomes: allIncomes, settlements: allSettlements, t })
    } catch (e) {
      console.error('Export failed', e)
      alert(t('group.exportFailed'))
      setExporting(false)
      return
    }

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
        console.error('Export failed', e)
        alert(t('group.exportFailed'))
      } finally {
        setExporting(false)
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
    setExporting(false)
  }

  // LINE 使用者認領訪客名字：之後這個名字只有本人能用
  const handleClaim = async (placeholderId) => {
    const name = group.memberProfiles?.[placeholderId]?.name
    if (!window.confirm(t('group.claimConfirm', { name }))) return
    setJoining(true)
    setJoinError('')
    try {
      await claimMember(id, placeholderId)
    } catch (error) {
      console.error('Claim failed', error)
      setJoinError(t('group.claimFailed'))
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
      console.error('Join failed', error)
      setJoinError(error?.code === 'permission-denied'
        ? t('group.joinDenied')
        : t('group.joinFailed'))
      setJoining(false)
    }
  }

  if (groupMissing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cs-bg)', color: 'var(--cs-text-sub)', gap: 16, padding: 24, textAlign: 'center' }}>
        <div>{t('group.notFound')}</div>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '10px 24px', borderRadius: 6, border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-text)', fontSize: 14, cursor: 'pointer' }}
        >
          {t('group.backHome')}
        </button>
      </div>
    )
  }

  if (!group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cs-bg)', color: 'var(--cs-text-sub)' }}>
        {t('common.loading')}
      </div>
    )
  }

  // 未加入成員 → 顯示加入畫面
  if (!isMember) {
    const profiles = Object.values(group.memberProfiles || {})
    const placeholders = (group.members || []).filter(m => group.memberProfiles?.[m]?.placeholder)
    const choosingIdentity = !user.guest && placeholders.length > 0 && !joinAsNew
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', display: 'flex', flexDirection: 'column' }}>
        <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '16px 16px 32px', position: 'relative' }}>
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <GroupIcon icon={group.icon} color={group.iconColor} size={72} onDark />
            </div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 500, marginBottom: 4 }}>{group.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{t('group.invitedBanner')}</div>
          </div>
        </div>
        <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 10 }}>{t('group.currentMembers')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profiles.slice(0, 3).map((member, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar src={member.avatar} name={member.name} size={36} />
                  <div style={{ fontSize: 14, color: 'var(--cs-text)', fontWeight: 500 }}>{member.name}</div>
                </div>
              ))}
              {(group.members?.length || 0) > 3 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--cs-border)', color: 'var(--cs-text-sub)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    +{group.members.length - 3}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--cs-text-sub)' }}>{t('group.memberUnit')}</div>
                </div>
              )}
            </div>
          </div>
          {!user.guest && !choosingIdentity && <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 10 }}>{t('group.joinAs')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--cs-soft)', borderRadius: 6, padding: '10px 12px' }}>
              <Avatar src={user?.avatar} name={user?.name} size={40} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cs-text)' }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', marginTop: 2 }}>{t('group.lineAccount')}</div>
              </div>
              <Check size={18} color="var(--cs-rc-stamp)" strokeWidth={3} style={{ marginLeft: 'auto', flexShrink: 0 }} />
            </div>
          </div>}
          {/* 訪客（已在其他群組用訪客名字）：輸入新名字或選既有名字 */}
          {user.guest && (
            <GuestJoin groupId={id} guests={placeholders.map(pid => ({ id: pid, name: group.memberProfiles[pid].name }))} />
          )}
          {choosingIdentity && (
            <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 4 }}>{t('group.claimTitle')}</div>
              <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', marginBottom: 10 }}>{t('group.claimHint')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {placeholders.map(pid => (
                  <button
                    key={pid}
                    onClick={() => handleClaim(pid)}
                    disabled={joining}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--cs-soft)', border: 'none', borderRadius: 6, padding: '10px 12px', cursor: joining ? 'not-allowed' : 'pointer', textAlign: 'left' }}
                  >
                    <Avatar src={null} name={group.memberProfiles[pid].name} size={36} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--cs-text)' }}>{group.memberProfiles[pid].name}</span>
                    <span style={{ fontSize: 12, color: 'var(--cs-rc-stamp)' }}>{t('group.claimButton')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ flex: 1 }} />
          {joinError && (
            <div style={{ fontSize: 13, color: 'var(--cs-danger)', textAlign: 'center' }}>{joinError}</div>
          )}
          {choosingIdentity && (
            <button
              onClick={() => setJoinAsNew(true)}
              style={{ width: '100%', padding: '12px 0', borderRadius: 6, border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-text-sub)', fontSize: 14, cursor: 'pointer' }}
            >
              {t('group.notInList')}
            </button>
          )}
          {joinAsNew && placeholders.length > 0 && !user.guest && (
            <button
              onClick={() => setJoinAsNew(false)}
              style={{ background: 'none', border: 'none', color: 'var(--cs-text-sub)', fontSize: 13, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              {t('group.backToClaim')}
            </button>
          )}
          {!user.guest && !choosingIdentity && <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 6, border: 'none', fontSize: 15, fontWeight: 500,
              cursor: joining ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              background: joining ? 'var(--cs-line-soft)' : 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)',
            }}
          >
            {joining ? t('common.processing') : placeholders.length > 0 ? t('group.joinAsNew', { group: group.name }) : t('group.join', { group: group.name })}
          </button>}
          <button
            onClick={() => navigate('/')}
            style={{ width: '100%', padding: '12px 0', borderRadius: 6, border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-text-sub)', fontSize: 14, cursor: 'pointer' }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }

  const profiles = Object.values(group.memberProfiles || {})
  // 從即時清單取值，刪除後會自動變成 undefined 而關閉彈窗
  const detailSettlement = settlements.find(s => s.id === detailSettlementId)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', display: 'flex', flexDirection: 'column' }}>

      {/* 設定選單（fixed 避免被 header 的 overflow 裁掉） */}
      {settingsPos && (
        <>
          <div onClick={() => setSettingsPos(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'fixed', top: settingsPos.top, right: settingsPos.right, zIndex: 41, minWidth: 140, padding: 4,
            background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', boxShadow: '0 4px 16px rgba(255,140,66,0.18)',
          }}>
            {[
              { label: t('group.menu.edit'), Icon: Pencil, onClick: () => navigate(`/group/${id}/edit`) },
              { label: t('eg.members'), Icon: Users, onClick: () => navigate(`/group/${id}/members`) },
              { label: t('group.menu.invite'), Icon: UserPlus, onClick: () => { setSettingsPos(null); setInviteOpen(true) } },
              {
                label: exporting ? t('group.menu.exporting') : t('group.menu.export'), Icon: Download, disabled: !groupHasItems || exporting,
                onClick: async () => { await handleExportCSV(); setSettingsPos(null) },
              },
            ].map(({ label, Icon, onClick, disabled }) => (
              <button
                key={label} onClick={onClick} disabled={disabled}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 6, border: 'none',
                  background: 'transparent', fontSize: 14, color: 'var(--cs-text)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, textAlign: 'left',
                }}
              >
                <Icon size={16} color="var(--cs-rc-stamp)" />{label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Header */}
      <div className="cs-header" style={{
        background: 'var(--cs-rc-head)',
        padding: '16px 16px 24px', position: 'relative', fontWeight: 700, isolation: 'isolate',
      }}>
        {group.coverUrl ? (
          <>
            {/* 網頁版：同一張圖放大、模糊鋪滿兩側（手機版隱藏） */}
            <img
              className="cs-cover-bg"
              src={group.coverUrl}
              alt=""
              style={{
                display: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -3,
                filter: 'blur(40px)', transform: 'scale(1.15)',
                opacity: loadedCover === group.coverUrl ? 1 : 0, transition: 'opacity 0.25s',
              }}
            />
            <div className="cs-cover" style={{ position: 'absolute', inset: 0, zIndex: -2 }}>
              <img
                ref={el => { if (el?.complete && el.naturalWidth) setLoadedCover(group.coverUrl) }}
                src={group.coverUrl}
                alt=""
                onLoad={() => setLoadedCover(group.coverUrl)}
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                  opacity: loadedCover === group.coverUrl ? 1 : 0, transition: 'opacity 0.25s',
                }}
              />
            </div>
            <div style={{ position: 'absolute', inset: 0, zIndex: -1, background: 'linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.5))' }} />
          </>
        ) : null}

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

          {/* 直接導向（同首頁的 <a href>）；liff.openWindow 在三星雙開 LINE 的副本會被導回主 LINE */}
          <button
            onClick={() => { window.location.href = OFFICIAL_ACCOUNT_URL }}
            aria-label={t('group.menu.official')}
            style={{ background: 'var(--cs-on-brand)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >
            <LineIcon size={22} />
          </button>

          <button
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect()
              setSettingsPos({ top: r.bottom + 6, right: document.documentElement.clientWidth - r.right })
            }}
            aria-label={t('group.settings')}
            style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >
            <Settings size={20} />
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
              style={{ background: 'var(--cs-soft-2)', border: '2px solid rgba(255,255,255,0.6)', marginLeft: i === 0 ? 0 : -6 }}
            />
          ))}
          {(group.members?.length || 0) > 6 && (
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.6)', marginLeft: -6, background: 'var(--cs-soft-2)', color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
              +{group.members.length - 6}
            </div>
          )}
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 8 }}>
            {t('group.memberCount', { n: group.members?.length })}
          </span>
          <button
            onClick={() => navigate(`/group/${id}/settle`)}
            style={{ marginLeft: 'auto', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', border: 'none', borderRadius: 6, padding: '7px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            {t('tab.settle')}
          </button>
        </div>

        {/* 總金額卡片 */}
        <div
          onClick={() => navigate(`/group/${id}/stats`)}
          style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: 14, border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          onTouchStart={e => e.currentTarget.style.opacity = '0.75'}
          onTouchEnd={e => e.currentTarget.style.opacity = '1'}
        >
          <div style={{ flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginBottom: 4 }}>
              {t('group.totalExpense')} · {t('group.expenseCount', { n: group.totalExpenses ?? 0 })}
            </div>
            {/* 收入只列出金額，不下結論（可能是起始金，也可能是退款）；差額看統計頁的結餘 */}
            {(group.incomeCount ?? 0) > 0 && (
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 4 }}>
                {t('stats.totalIncome')} {getCurrency(group.baseCurrency).symbol} {fmt.num(incomeTotal)}
              </div>
            )}
            <div style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>
              {getCurrency(group.baseCurrency).symbol} {fmt.num(total)}
            </div>
            {/* 預算進度條：<80% 白、80–99% 黃、≥100% 紅；淨額為負時寬度為 0 */}
            {budget && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${Math.max(0, Math.min(budget.ratio, 1)) * 100}%`, background: { ok: 'var(--cs-on-brand)', warn: 'var(--cs-on-brand-warn)', over: 'var(--cs-on-brand-over)' }[budget.level] }} />
                </div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  {/* 幣別符號與金額之間用不換行空白，避免金額被拆到下一行 */}
                  <span>
                  {t('group.budgetUsed', { spent: `${getCurrency(group.baseCurrency).symbol}\u00a0${fmt.num(budget.spent)}`, budget: `${getCurrency(group.baseCurrency).symbol}\u00a0${fmt.num(budget.amount)}` })}
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                  {budget.remaining >= 0
                    ? t('group.budgetLeft', { amount: `${getCurrency(group.baseCurrency).symbol}\u00a0${fmt.num(budget.remaining)}` })
                    : t('group.budgetOver', { amount: `${getCurrency(group.baseCurrency).symbol}\u00a0${fmt.num(-budget.remaining)}` })}
                  </span>
                </div>
              </div>
            )}
          </div>
          <ChevronRight size={22} color="rgba(255,255,255,0.8)" style={{ flexShrink: 0 }} />
        </div>
      </div>

      {/* 操作按鈕 */}
      <div className="cs-body" style={{ padding: '16px 16px 0' }}>
        {showOaBanner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--cs-card)', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '8px 8px 8px 12px', marginBottom: 12 }}>
            <LineIcon size={18} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--cs-text)' }}>{t('group.oaBanner')}</span>
            <button
              onClick={() => { window.location.href = OFFICIAL_ACCOUNT_URL }}
              style={{ border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}
            >
              {t('group.oaBannerAdd')}
            </button>
            <button onClick={hideOaBanner} aria-label={t('group.oaBannerClose')} style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
              <X size={14} color="var(--cs-text-sub)" />
            </button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cs-text-sub)' }}>{t('group.listTitle')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setSearchOpen(true)}
              aria-label={t('group.search')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--cs-text-sub)', display: 'flex', alignItems: 'center' }}
            >
              <Search size={16} />
              {isFiltering(filters) && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cs-rc-stamp)', marginLeft: 2, alignSelf: 'flex-start' }} />}
            </button>
          </div>
        </div>

        {/* 月份切換：搜尋／篩選中改看全部結果，這一列先收起 */}
        {monthKey && groupHasItems && !isFiltering(filters) && (() => {
          const sum = summarizeLoaded(expenses, incomes)
          const symbol = getCurrency(group.baseCurrency).symbol
          const arrow = { background: 'none', border: 'none', fontSize: 22, lineHeight: 1, padding: '2px 12px', cursor: 'pointer', color: 'var(--cs-text-sub)' }
          return (
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--cs-card)', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '4px 0', opacity: allMode ? 0.5 : 1 }}>
                  <button onClick={() => selectMonth(shiftMonth(monthKey, -1))} aria-label={t('month.prev')} style={arrow}>‹</button>
                  <button onClick={() => setMonthPickerOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--cs-text)', padding: '6px 4px' }}>
                    {fmt.yearMonth(monthRange(monthKey).start)} ▾
                  </button>
                  <button onClick={() => selectMonth(shiftMonth(monthKey, 1))} aria-label={t('month.next')} style={arrow}>›</button>
                </div>
                <button
                  onClick={toggleAll}
                  style={{ padding: '10px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: allMode ? '1.5px solid var(--cs-rc-stamp)' : '0.5px solid var(--cs-border)', background: allMode ? 'var(--cs-soft)' : 'var(--cs-card)', color: allMode ? 'var(--cs-rc-owe)' : 'var(--cs-text-sub)' }}
                >
                  {t('month.all')}
                </button>
              </div>
              {!loading && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--cs-text-sub)' }}>
                  {t('group.expenseCount', { n: sum.count })} · {t('group.totalExpense')} {symbol} {fmt.num(sum.expenseTotal)}
                  {sum.incomeTotal > 0 && ` · ${t('stats.totalIncome')} ${symbol} ${fmt.num(sum.incomeTotal)}`}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* 支出列表 */}
      <div className="cs-body" style={{ padding: '0 16px 80px', flex: 1 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>
        )}

        {!loading && !groupHasItems && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Receipt size={48} color="var(--cs-line-soft)" /></div>
            <div style={{ color: 'var(--cs-text-sub)', fontSize: 14, marginBottom: 4 }}>{t('group.emptyTitle')}</div>
            <div style={{ color: 'var(--cs-text-mute)', fontSize: 13 }}>{t('group.emptyHint')}</div>
          </div>
        )}

        {!loading && (() => {
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
            ...expenses.map(e => ({ ...e, _type: 'expense' })),
            ...settlements.map(s => ({ ...s, _type: 'settlement' })),
            ...incomes.map(i => ({ ...i, _type: 'income' })),
          ].sort((a, b) => dayKey(b) - dayKey(a) || sortTime(b) - sortTime(a))

          if (allItems.length === 0) return groupHasItems ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--cs-text-sub)', fontSize: 14 }}>{t('month.empty')}</div>
          ) : null

          const filtering = isFiltering(filters)
          const shownItems = applyFilters(allItems, filters, {
            uid: user?.uid, memberProfiles: group.memberProfiles, baseCurrency: group.baseCurrency || 'TWD',
            categoryLabelOf: (raw) => categoryLabel(raw, t),
          })
          const filterBanner = filtering && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 0', fontSize: 12, color: 'var(--cs-text-sub)' }}>
              <span>{t('search.resultCount', { n: shownItems.length })}</span>
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                style={{ fontSize: 12, color: 'var(--cs-rc-stamp)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              >
                {t('search.clear')} <X size={11} strokeWidth={3} />
              </button>
            </div>
          )
          if (filtering && shownItems.length === 0) return (
            <>
              {filterBanner}
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Search size={40} color="var(--cs-line-soft)" /></div>
                <div style={{ color: 'var(--cs-text-sub)', fontSize: 14 }}>{t('group.noMatch')}</div>
              </div>
            </>
          )

          const toDateLabel = (item) => item.createdAt?.toDate
            ? fmt.date(item.createdAt.toDate())
            : t('group.unknownDate')

          const groups = []
          let currentDate = null
          shownItems.forEach(item => {
            const dateLabel = toDateLabel(item)
            if (dateLabel !== currentDate) {
              currentDate = dateLabel
              groups.push({ date: dateLabel, items: [] })
            }
            groups[groups.length - 1].items.push(item)
          })

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {filterBanner}
              {groups.map(({ date, items }) => (
                <div key={date}>
                  <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', fontWeight: 500, padding: '12px 0 6px', letterSpacing: '0.03em' }}>
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
                            style={{ background: 'var(--cs-success-bg)', borderRadius: 6, border: '0.5px solid var(--cs-success-border)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', fontSize: 13, fontWeight: 500, color: 'var(--cs-success)', marginBottom: 2 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from?.name}</span>
                                <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>&nbsp;{t('group.transferTo')}</span>
                              </div>
                              <div style={{ display: 'flex', fontSize: 13, fontWeight: 500, color: 'var(--cs-success)' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to?.name}</span>
                                {item.paymentMethod && (
                                  <span style={{ flexShrink: 0, whiteSpace: 'nowrap', marginLeft: 6, fontSize: 11, fontWeight: 400, color: '#66bb6a' }}>
                                    {paymentMethodLabel(item.paymentMethod, t)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-success)' }}>
                                {getCurrency(item.currency || group.baseCurrency).symbol} {fmt.num(item.amount)}
                              </div>
                            </div>
                            <ChevronRight size={16} color="#66bb6a" style={{ flexShrink: 0 }} />
                          </div>
                        )
                      }

                      if (item._type === 'income') {
                        return (
                          <div
                            key={item.id}
                            onClick={() => navigate(`/group/${id}/income/${item.id}`)}
                            style={{ background: 'var(--cs-info-bg)', borderRadius: 6, border: '0.5px solid var(--cs-info-border)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                            onTouchStart={e => e.currentTarget.style.opacity = '0.75'}
                            onTouchEnd={e => e.currentTarget.style.opacity = '1'}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-info)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                  {categoryLabel(item.category, t)}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.title}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', display: 'flex' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {payerLabel(item.received, group.memberProfiles, t)}
                                </span>
                                <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>&nbsp;{t(item.isSponsorship ? 'group.sponsoredSuffix' : 'group.receivedSuffix')}{expenseTimeStr(item) && ` · ${expenseTimeStr(item)}`}</span>
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-info)' }}>
                                {getCurrency(item.currency || group.baseCurrency).symbol} {fmt.num(item.originalAmount ?? item.amount)}
                              </div>
                              {item.currency && item.currency !== (group.baseCurrency || 'TWD') && (
                                <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', marginTop: 1 }}>
                                  ≈ {getCurrency(group.baseCurrency).symbol} {fmt.num(item.amount)}
                                </div>
                              )}
                            </div>
                            <ChevronRight size={16} color="var(--cs-info-chevron)" style={{ flexShrink: 0 }} />
                          </div>
                        )
                      }

                      const isMenuOpen = openMenuId === item.id
                      return (
                        <div key={item.id} style={{ position: 'relative' }}>
                          <div
                            onClick={() => navigate(`/group/${id}/expense/${item.id}`)}
                            style={{ background: spendTypeBg(item.paymentMethod), borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                            onTouchStart={e => e.currentTarget.style.opacity = '0.75'}
                            onTouchEnd={e => e.currentTarget.style.opacity = '1'}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-rc-owe)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                  {categoryLabel(item.category, t)}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.title}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', display: 'flex' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {payerLabel(item.payments, group.memberProfiles, t)}
                                </span>
                                <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>&nbsp;{t('group.paidSuffix')}{expenseTimeStr(item) && ` · ${expenseTimeStr(item)}`}</span>
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div style={{ fontFamily: 'var(--cs-rc-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 600, color: 'var(--cs-rc-owe)' }}>
                                {getCurrency(item.currency || group.baseCurrency).symbol} {fmt.num(item.originalAmount ?? item.amount)}
                              </div>
                              {item.currency && item.currency !== (group.baseCurrency || 'TWD') && (
                                <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', marginTop: 1 }}>
                                  ≈ {getCurrency(group.baseCurrency).symbol} {fmt.num(item.amount)}
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
                              style={{ background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer', color: 'var(--cs-text-mute)', flexShrink: 0, display: 'flex', alignItems: 'center' }}
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
                              <div style={{ position: 'absolute', ...(menuUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }), right: 0, zIndex: 11, background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', overflow: 'hidden', minWidth: 120 }}>
                                <button
                                  onClick={e => { e.stopPropagation(); setOpenMenuId(null); navigate(`/group/${id}/expense/${item.id}/edit`) }}
                                  style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, color: 'var(--cs-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                                >
                                  <Pencil size={14} /> {t('common.edit')}
                                </button>
                                <div style={{ height: '0.5px', background: 'var(--cs-border)' }} />
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteExpense(item.id) }}
                                  style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, color: 'var(--cs-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                                >
                                  <Trash2 size={14} /> {t('common.delete')}
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

      {monthPickerOpen && monthKey && (
        <MonthPicker
          value={monthKey}
          onPick={(key) => { setMonthPickerOpen(false); selectMonth(key) }}
          onClose={() => setMonthPickerOpen(false)}
        />
      )}

      {searchOpen && (
        <SearchSheet
          initial={filters}
          categories={Array.from(new Set([...expenses, ...incomes].map(e => normalizeCategory(e.category))))}
          currencies={Array.from(new Set([...expenses, ...incomes, ...settlements].map(e => e.currency || group.baseCurrency || 'TWD')))}
          onApply={(f) => { setFilters(f); setSearchOpen(false) }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {inviteOpen && (
        <InviteModal
          content={buildShareContent(id, group, t, lang)}
          text={t('group.inviteText', { user: user?.name, group: group.name })}
          liff={liffInstance}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {detailSettlement && (
        <div
          onClick={() => setDetailSettlementId(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, background: 'var(--cs-card)', borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 28 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-text)' }}>{t('group.settlementDetail')}</div>
              <button
                onClick={() => setDetailSettlementId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                <X size={20} color="var(--cs-text-sub)" />
              </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 500, color: 'var(--cs-success)', marginBottom: 16 }}>
              {getCurrency(detailSettlement.currency || group.baseCurrency).symbol} {fmt.num(detailSettlement.amount)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {[
                [t('group.detail.from'), group.memberProfiles?.[detailSettlement.from]?.name],
                [t('group.detail.to'), group.memberProfiles?.[detailSettlement.to]?.name],
                [t('group.detail.method'), detailSettlement.paymentMethod && paymentMethodLabel(detailSettlement.paymentMethod, t)],
                [t('group.detail.note'), detailSettlement.note],
                [t('group.detail.time'), detailSettlement.createdAt?.toDate && fmt.dateTimeFull(detailSettlement.createdAt.toDate())],
                [t('group.detail.by'), group.memberProfiles?.[detailSettlement.settledBy]?.name],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                  <div style={{ width: 64, flexShrink: 0, color: 'var(--cs-text-sub)' }}>{label}</div>
                  <div style={{ flex: 1, minWidth: 0, color: 'var(--cs-text)', wordBreak: 'break-word' }}>{value}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleDeleteSettlement(detailSettlement.id, group)}
              style={{ width: '100%', padding: '12px 0', borderRadius: 6, border: '1px solid var(--cs-danger-border)', background: 'var(--cs-card)', color: 'var(--cs-danger)', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Trash2 size={14} /> {t('group.deleteSettlement')}
            </button>
          </div>
        </div>
      )}

      <TabBar context="group" groupId={id} />
    </div>
  )
}

export default GroupPage
