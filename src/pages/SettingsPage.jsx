// /settings — 設定：顯示自己的頭像與名稱，可切換語言；LINE 使用者可在最下方的危險區刪除自己的資料。
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { Trash2 } from 'lucide-react'
import { db } from '../config/firebase'
import { useApp, NICKNAME_MAX_LENGTH } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import { useTheme } from '../theme/ThemeProvider'
import Avatar from '../components/Avatar'
import TabBar from '../components/TabBar'
import { deleteMyData, planDeleteMyData } from '../utils/deleteMyData'

const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }

const SettingsPage = () => {
  const { user, logout, saveNickname } = useApp()
  const { t, lang, setLang } = useI18n()
  const { mode, setMode } = useTheme()
  const navigate = useNavigate()
  const [groups, setGroups] = useState(null)
  const [deletingData, setDeletingData] = useState(false)
  const canDelete = !!user && !user.guest
  // 有暱稱時 user.lineName 才有值；輸入框沒動過就顯示目前暱稱
  const currentNickname = user?.lineName ? user.name : ''
  const [nicknameInput, setNicknameInput] = useState(null)
  const [nicknameSaving, setNicknameSaving] = useState(false)
  const nicknameDirty = nicknameInput !== null && nicknameInput.trim() !== currentNickname

  const handleSaveNickname = async () => {
    setNicknameSaving(true)
    try {
      await saveNickname(nicknameInput)
      setNicknameInput(null)
    } catch (error) {
      console.error('Failed to save nickname', error)
      alert(t('settings.nicknameFailed'))
    } finally {
      setNicknameSaving(false)
    }
  }

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
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 80 }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/')} aria-label={t('pay.back')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('group.settings')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 頭像與名稱 */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 14px' }}>
          <Avatar src={user?.avatar} name={user?.name} size={88} style={{ background: 'var(--cs-soft-2)', border: '3px solid var(--cs-border)' }} />
          <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--cs-text)', textAlign: 'center', wordBreak: 'break-word' }}>
            {user?.lineName ?? user?.name}{user?.lineName && ` / ${user.name}`}
          </div>
        </div>

        {/* 顯示名稱（全域暱稱）：訪客的名字屬於群組，不能在這裡改 */}
        {canDelete && (
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 8 }}>{t('settings.nickname')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={nicknameInput ?? currentNickname}
                onChange={e => setNicknameInput(e.target.value)}
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder={t('settings.nicknamePlaceholder')}
                style={{ flex: 1, minWidth: 0, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
              />
              <button
                onClick={handleSaveNickname}
                disabled={!nicknameDirty || nicknameSaving}
                style={{ padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 500, flexShrink: 0, color: 'var(--cs-rc-stamp-text)', cursor: nicknameDirty && !nicknameSaving ? 'pointer' : 'not-allowed', background: nicknameDirty && !nicknameSaving ? 'var(--cs-rc-stamp)' : 'var(--cs-line-soft)' }}
              >
                {nicknameSaving ? t('settings.nicknameSaving') : t('settings.nicknameSave')}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--cs-text-sub)', lineHeight: 1.6, marginTop: 8 }}>
              {t('settings.nicknameHint', { name: user?.lineName ?? user?.name })}
            </div>
          </div>
        )}

        {/* 語言：所有人都能手動切換；EN_READY 只影響「沒選過語言時」是否依瀏覽器語言自動判定 */}
        <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 8 }}>{t('settings.language')}</div>
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              style={{ width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
            >
              <option value="zh-TW">{t('lang.zh-TW')}</option>
              <option value="en">{t('lang.en')}</option>
            </select>
        </div>

        {/* 外觀：跟隨系統／淺色／深色，只存在這台裝置 */}
        <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 8 }}>{t('settings.theme')}</div>
            <select
              value={mode}
              onChange={e => setMode(e.target.value)}
              style={{ width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
            >
              <option value="system">{t('settings.theme.system')}</option>
              <option value="light">{t('settings.theme.light')}</option>
              <option value="dark">{t('settings.theme.dark')}</option>
            </select>
        </div>

        {/* 條款與隱私權：英文版是另一份靜態頁；中文版維持原網址 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12 }}>
          <a href={lang === 'en' ? '/terms.en.html' : '/terms.html'} style={{ color: 'var(--cs-text-sub)' }}>{t('home.menu.terms')}</a>
          <a href={lang === 'en' ? '/privacy.en.html' : '/privacy.html'} style={{ color: 'var(--cs-text-sub)' }}>{t('home.menu.privacy')}</a>
        </div>

        {/* 危險區：訪客名字屬於群組，不能自行刪除；由群組建立者移除 */}
        {canDelete && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--cs-danger-border)' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-danger)', marginBottom: 8 }}>{t('settings.dangerZone')}</div>
            <div style={{ ...card, border: '0.5px solid var(--cs-danger-border)' }}>
              <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', lineHeight: 1.6, marginBottom: 12 }}>{t('settings.deleteHint')}</div>
              <button
                onClick={handleDeleteMyData}
                disabled={deletingData || groups === null}
                style={{ width: '100%', padding: '12px 0', borderRadius: 6, border: '1px solid var(--cs-danger-border)', background: 'var(--cs-card)', color: 'var(--cs-danger)', fontSize: 14, fontWeight: 500, cursor: deletingData || groups === null ? 'not-allowed' : 'pointer', opacity: groups === null ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
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
