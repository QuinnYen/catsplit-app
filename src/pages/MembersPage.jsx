// /group/:id/members — 成員管理：查看成員、新增與改訪客名字、建立者移除成員。
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import Avatar from '../components/Avatar'

const MembersPage = () => {
  const { id } = useParams()
  const { user, forgetGuestName } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [removingUid, setRemovingUid] = useState(null)
  const [renamingUid, setRenamingUid] = useState(null)
  const [renameInput, setRenameInput] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [placeholderName, setPlaceholderName] = useState('')
  const [addingPlaceholder, setAddingPlaceholder] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const snap = await getDoc(doc(db, 'groups', id))
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() })
    }
    fetch()
  }, [id])

  const handleRenameMember = async (uid) => {
    const trimmed = renameInput.trim()
    if (!trimmed || trimmed === group.memberProfiles?.[uid]?.name) {
      setRenamingUid(null)
      return
    }
    setRenameSaving(true)
    const updatedProfiles = {
      ...group.memberProfiles,
      [uid]: { ...group.memberProfiles[uid], name: trimmed },
    }
    await updateDoc(doc(db, 'groups', id), { memberProfiles: updatedProfiles })
    setGroup(prev => ({ ...prev, memberProfiles: updatedProfiles }))
    setRenamingUid(null)
    setRenameSaving(false)
  }

  // 訪客名字：朋友不用登入，點群組連結選這個名字即可使用；用 LINE 登入認領後就只有本人能用
  const handleAddPlaceholder = async () => {
    const trimmed = placeholderName.trim()
    if (!trimmed || addingPlaceholder) return
    if (group.members.length >= 50) {
      alert(t('eg.limit50'))
      return
    }
    setAddingPlaceholder(true)
    try {
      const pid = `p_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
      const profile = { name: trimmed, avatar: null, placeholder: true }
      await updateDoc(doc(db, 'groups', id), {
        members: arrayUnion(pid),
        [`memberProfiles.${pid}`]: profile,
      })
      setGroup(prev => ({
        ...prev,
        members: [...prev.members, pid],
        memberProfiles: { ...prev.memberProfiles, [pid]: profile },
      }))
      setPlaceholderName('')
    } catch (error) {
      console.error('Failed to add placeholder member', error)
      alert(t('eg.addFailed'))
    }
    setAddingPlaceholder(false)
  }

  const handleRemoveMember = async (uid) => {
    if (uid === group.createdBy) return
    if (!confirm(t('eg.confirmRemove', { name: group.memberProfiles?.[uid]?.name }))) return
    setRemovingUid(uid)
    const updatedProfiles = { ...group.memberProfiles }
    delete updatedProfiles[uid]
    await updateDoc(doc(db, 'groups', id), {
      members: arrayRemove(uid),
      memberProfiles: updatedProfiles,
    })
    setGroup(prev => ({
      ...prev,
      members: prev.members.filter(m => m !== uid),
      memberProfiles: updatedProfiles,
    }))
    setRemovingUid(null)
  }

  if (!group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cs-bg)', color: 'var(--cs-text-sub)' }}>
        {t('common.loading')}
      </div>
    )
  }

  const isCreator = user?.uid === group.createdBy

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 40 }}>

      {/* Header */}
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ‹
          </button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('eg.members')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.members.map((uid, idx) => {
              const profile = group.memberProfiles?.[uid]
              const isCreatorMember = uid === group.createdBy
              const isRenaming = renamingUid === uid
              const isLast = idx === group.members.length - 1
              return (
                <div key={uid} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: isLast ? 'none' : '0.5px solid var(--cs-track)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar
                      src={profile?.avatar}
                      name={profile?.name}
                      size={38}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--cs-text)', fontWeight: 500 }}>{profile?.name}</div>
                      {isCreatorMember && (
                        <div style={{ fontSize: 11, color: 'var(--cs-rc-stamp)' }}>{t('eg.creator')}</div>
                      )}
                      {profile?.placeholder && (
                        <div style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{t('eg.guestName')}</div>
                      )}
                      {user?.guest && uid === user.uid && (
                        <div style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>
                          {t('eg.inUse')}
                          <button
                            onClick={() => {
                              if (!confirm(t('eg.switchName'))) return
                              navigate(`/group/${id}`, { replace: true })
                              forgetGuestName(id)
                            }}
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--cs-rc-owe)', textDecoration: 'underline', cursor: 'pointer' }}
                          >
                            {t('eg.notYou')}
                          </button>
                        </div>
                      )}
                    </div>
                    {/* LINE 成員的名字由本人在設定頁統一設定；只有訪客名字能在群組內改 */}
                    {profile?.placeholder && (
                      <button
                        onClick={() => { setRenamingUid(isRenaming ? null : uid); setRenameInput(profile?.name || '') }}
                        style={{
                          padding: '6px 12px', borderRadius: 6, border: '1px solid var(--cs-border)', background: isRenaming ? 'var(--cs-soft)' : 'var(--cs-card)', color: isRenaming ? 'var(--cs-rc-stamp)' : 'var(--cs-text-sub)', fontSize: 12, cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        {isRenaming ? t('common.cancel') : t('eg.rename')}
                      </button>
                    )}
                    {isCreator && !isCreatorMember && (
                      <button
                        onClick={() => handleRemoveMember(uid)}
                        disabled={removingUid === uid}
                        style={{
                          padding: '6px 12px', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-danger)', fontSize: 12, cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        {removingUid === uid ? t('eg.removing') : t('eg.remove')}
                      </button>
                    )}
                  </div>

                  {/* 改名 input */}
                  {isRenaming && (
                    <div style={{ display: 'flex', gap: 8, paddingLeft: 48 }}>
                      <input
                        type="text"
                        value={renameInput}
                        onChange={e => setRenameInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleRenameMember(uid)}
                        autoFocus
                        maxLength={20}
                        placeholder={t('eg.renamePlaceholder')}
                        style={{ flex: 1, minWidth: 0, border: '0.5px solid var(--cs-rc-stamp)', borderRadius: 6, padding: '9px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
                      />
                      <button
                        onClick={() => handleRenameMember(uid)}
                        disabled={renameSaving || !renameInput.trim()}
                        style={{
                          padding: '9px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                          background: renameSaving || !renameInput.trim() ? 'var(--cs-line-soft)' : 'var(--cs-rc-stamp)',
                          color: 'var(--cs-rc-stamp-text)',
                        }}
                      >
                        {renameSaving ? t('eg.saving') : t('eg.confirm')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <input
              type="text"
              value={placeholderName}
              onChange={e => setPlaceholderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddPlaceholder()}
              maxLength={20}
              placeholder={t('eg.addGuestPlaceholder')}
              style={{ flex: 1, minWidth: 0, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
            />
            <button
              onClick={handleAddPlaceholder}
              disabled={addingPlaceholder || !placeholderName.trim()}
              style={{
                padding: '10px 16px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 500, flexShrink: 0,
                cursor: addingPlaceholder || !placeholderName.trim() ? 'not-allowed' : 'pointer',
                background: addingPlaceholder || !placeholderName.trim() ? 'var(--cs-line-soft)' : 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)',
              }}
            >
              {addingPlaceholder ? t('eg.adding') : t('eg.add')}
            </button>
          </div>

          {!isCreator && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--cs-bg)', borderRadius: 6, fontSize: 12, color: 'var(--cs-text-sub)' }}>
              {t('eg.onlyCreatorRemove')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MembersPage
