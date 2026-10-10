// /settings — 設定：顯示自己的頭像與名稱，可切換語言；LINE 使用者可在最下方的危險區刪除自己的資料。
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { Trash2 } from 'lucide-react'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import Avatar from '../components/Avatar'
import PawDecor from '../components/PawDecor'
import TabBar from '../components/TabBar'
import { deleteMyData, planDeleteMyData } from '../utils/deleteMyData'

const card = { background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }

const SettingsPage = () => {
  const { user, logout } = useApp()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()
  const [groups, setGroups] = useState(null)
  const [deletingData, setDeletingData] = useState(false)
  const canDelete = !!user && !user.guest

  // 刪除資料要知道自己在哪些群組；訪客不能刪除，不需要讀取
  useEffect(() => {
    if (!canDelete) return
    const q = query(collection(db, 'groups'), where('members', 'array-contains', user.uid), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (error) => {
      console.error('Failed to load groups:', error)
      setGroups([])
    })
  }, [canDelete, user?.uid])

  const handleDeleteMyData = async () => {
    const { toDelete, toLeave, toDissolve } = planDeleteMyData(groups, user.uid)
    const dissolveIds = new Set(toDissolve.map(g => g.id))
    const keep = toLeave.filter(g => !dissolveIds.has(g.id))
    const owing = keep.filter(g => Math.abs(g.memberBalances?.[user.uid] ?? 0) >= 0.01)
    const lines = [
      t('home.del.title'),
      '',
      t('home.del.leave', { n: keep.length }),
      t('home.del.delete', { n: toDelete.length + toDissolve.length }),
    ]
    if (owing.length > 0) {
      lines.push('', t('home.del.owing'), ...owing.map(g => `  - ${g.name}`))
    }
    lines.push('', t('home.del.footer'))
    if (!confirm(lines.join('\n'))) return
    setDeletingData(true)
    try {
      await deleteMyData(groups, user.uid)
      logout()
    } catch (error) {
      console.error('Failed to delete data', error)
      alert(t('home.del.failed'))
      setDeletingData(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 80 }}>
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <PawDecor />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/')} aria-label={t('pay.back')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('group.settings')}</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 頭像與名稱 */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 14px' }}>
          <Avatar src={user?.avatar} name={user?.name} size={88} style={{ background: '#ffe0c8', border: '3px solid #f0d5c0' }} />
          <div style={{ fontSize: 18, fontWeight: 500, color: '#3d2b1f', textAlign: 'center', wordBreak: 'break-word' }}>{user?.name}</div>
        </div>

        {/* 語言：所有人都能手動切換；EN_READY 只影響「沒選過語言時」是否依瀏覽器語言自動判定 */}
        <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>{t('settings.language')}</div>
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
            >
              <option value="zh-TW">{t('lang.zh-TW')}</option>
              <option value="en">{t('lang.en')}</option>
            </select>
        </div>

        {/* 危險區：訪客名字屬於群組，不能自行刪除；由群組建立者移除 */}
        {canDelete && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed #f0b8b0' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#e53935', marginBottom: 8 }}>{t('settings.dangerZone')}</div>
            <div style={{ ...card, border: '0.5px solid #ffcdd2' }}>
              <div style={{ fontSize: 12, color: '#b08060', lineHeight: 1.6, marginBottom: 12 }}>{t('settings.deleteHint')}</div>
              <button
                onClick={handleDeleteMyData}
                disabled={deletingData || groups === null}
                style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: '1px solid #ffcdd2', background: '#fff', color: '#e53935', fontSize: 14, fontWeight: 500, cursor: deletingData || groups === null ? 'not-allowed' : 'pointer', opacity: groups === null ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Trash2 size={16} /> {deletingData ? t('home.menu.deleting') : t('home.menu.deleteData')}
              </button>
            </div>
          </div>
        )}
      </div>

      <TabBar context="create" />
    </div>
  )
}

export default SettingsPage
