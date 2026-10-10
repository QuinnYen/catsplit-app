// /group/:id/edit — 群組設定：改名稱、圖示與封面、管理成員，以及退出、封存或刪除群組。
import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, arrayRemove, arrayUnion, collection, getDocs, writeBatch } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import Avatar from '../components/Avatar'
import GroupIconPicker from '../components/GroupIconPicker'
import PawDecor from '../components/PawDecor'
import { deleteGroupFiles } from '../utils/storageCleanup'
import { detachFromGroups } from '../utils/deleteMyData'

// 裁圖元件（含 react-easy-crop）選了圖片才需要
const CropModal = lazy(() => import('../components/CropModal'))

const EditGroupPage = () => {
  const { id } = useParams()
  const { user, forgetGuestName } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [iconSaving, setIconSaving] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [coverSaving, setCoverSaving] = useState(false)
  const [removingUid, setRemovingUid] = useState(null)
  const [renamingUid, setRenamingUid] = useState(null)
  const [renameInput, setRenameInput] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [placeholderName, setPlaceholderName] = useState('')
  const [addingPlaceholder, setAddingPlaceholder] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const snap = await getDoc(doc(db, 'groups', id))
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setGroup(data)
        setName(data.name)
      }
    }
    fetch()
  }, [id])

  const handleSaveName = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === group.name) return
    setSaving(true)
    await updateDoc(doc(db, 'groups', id), { name: trimmed })
    setGroup(prev => ({ ...prev, name: trimmed }))
    setSaving(false)
  }

  const handleChangeIcon = async (patch) => {
    if (iconSaving) return
    setIconSaving(true)
    try {
      await updateDoc(doc(db, 'groups', id), patch)
      setGroup(prev => ({ ...prev, ...patch }))
    } catch (error) {
      console.error('Failed to update icon', error)
    }
    setIconSaving(false)
  }

  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  const handleCoverFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    try {
      // 先縮小，避免相機原圖過大塞爆 canvas；同時修正 EXIF 旋轉。
      // 不設 maxSizeMB：裁切後會再輸出較小的圖，這裡只縮尺寸一次，不反覆降畫質
      const { default: imageCompression } = await import('browser-image-compression')
      const resized = await imageCompression(file, { maxWidthOrHeight: 1600, useWebWorker: true })
      setCropSrc(URL.createObjectURL(resized))
    } catch (error) {
      console.error('Failed to read image', error)
    }
  }

  const deleteOldCover = async (url) => {
    if (!url) return
    try {
      await deleteObject(ref(storage, url))
    } catch (error) {
      console.warn('Failed to delete old cover', error)
    }
  }

  const handleCoverConfirm = async (blob) => {
    closeCrop()
    setCoverSaving(true)
    try {
      const storageRef = ref(storage, `groups/${id}/cover/${Date.now()}.jpg`)
      const snapshot = await uploadBytes(storageRef, blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' })
      const coverUrl = await getDownloadURL(snapshot.ref)
      await updateDoc(doc(db, 'groups', id), { coverUrl })
      setGroup(prev => ({ ...prev, coverUrl }))
      // 刪舊檔不用等，背景進行（失敗只記警告）
      deleteOldCover(group.coverUrl)
    } catch (error) {
      console.error('Failed to upload cover', error)
    }
    setCoverSaving(false)
  }

  const handleRemoveCover = async () => {
    if (!group.coverUrl || coverSaving) return
    setCoverSaving(true)
    try {
      await updateDoc(doc(db, 'groups', id), { coverUrl: null })
      setGroup(prev => ({ ...prev, coverUrl: null }))
      deleteOldCover(group.coverUrl)
    } catch (error) {
      console.error('Failed to remove cover', error)
    }
    setCoverSaving(false)
  }

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

  const handleDeleteGroup = async () => {
    if (!confirm(t('eg.confirmDelete', { name: group.name }))) return
    setDeleting(true)
    try {
      await deleteGroupFiles(id)
      const [expensesSnap, settlementsSnap, incomesSnap] = await Promise.all([
        getDocs(collection(db, 'groups', id, 'expenses')),
        getDocs(collection(db, 'groups', id, 'settlements')),
        getDocs(collection(db, 'groups', id, 'incomes')),
      ])
      const batch = writeBatch(db)
      expensesSnap.docs.forEach(d => batch.delete(d.ref))
      settlementsSnap.docs.forEach(d => batch.delete(d.ref))
      incomesSnap.docs.forEach(d => batch.delete(d.ref))
      batch.delete(doc(db, 'groups', id))
      await batch.commit()
      navigate('/')
    } catch (error) {
      console.error('Failed to delete group', error)
      setDeleting(false)
    }
  }

  const handleArchiveToggle = async () => {
    const isArchived = !!group.archived
    const msg = isArchived
      ? t('eg.confirmUnarchive', { name: group.name })
      : t('eg.confirmArchive', { name: group.name })
    if (!confirm(msg)) return
    setArchiving(true)
    try {
      await updateDoc(doc(db, 'groups', id), { archived: !isArchived })
      setGroup(prev => ({ ...prev, archived: !isArchived }))
    } catch (error) {
      console.error('Failed to toggle archive', error)
    }
    setArchiving(false)
  }

  const handleLeaveGroup = async () => {
    if (!confirm(t('eg.confirmLeave', { name: group.name }))) return
    setLeaving(true)
    try {
      await detachFromGroups([id])
      navigate('/')
    } catch (error) {
      console.error('Failed to leave group', error)
      setLeaving(false)
    }
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        {t('common.loading')}
      </div>
    )
  }

  const isCreator = user?.uid === group.createdBy

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <PawDecor />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ‹
          </button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('group.menu.edit')}</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 群組名稱 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060' }}>{t('eg.name')}</div>
            <div style={{ fontSize: 11, color: '#c4a882' }}>{name.length} / 20</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={20}
              style={{ flex: 1, border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
            />
            <button
              onClick={handleSaveName}
              disabled={saving || !name.trim() || name.trim() === group.name}
              style={{
                padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                background: saving || !name.trim() || name.trim() === group.name ? '#e0c4b0' : '#FF8C42',
                color: '#fff',
              }}
            >
              {saving ? t('eg.saving') : t('common.save')}
            </button>
          </div>
        </div>

        {/* 群組圖示 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>{t('eg.icon')}</div>
          <GroupIconPicker
            icon={group.icon}
            color={group.iconColor}
            onChange={handleChangeIcon}
            disabled={iconSaving}
          />
        </div>

        {/* 群組封面 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>{t('eg.cover')}</div>
          <div style={{ fontSize: 13, color: '#3d2b1f', marginBottom: 10 }}>
            {coverSaving ? t('common.processing') : group.coverUrl ? t('eg.coverSet') : t('eg.coverNone')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: coverSaving ? '#e0c4b0' : '#FF8C42', color: '#fff', cursor: coverSaving ? 'not-allowed' : 'pointer',
            }}>
              {group.coverUrl ? t('eg.coverChange') : t('eg.coverChoose')}
              <input type="file" accept="image/*" onChange={handleCoverFile} disabled={coverSaving} style={{ display: 'none' }} />
            </label>
            {group.coverUrl && (
              <button
                onClick={handleRemoveCover}
                disabled={coverSaving}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #f0d5c0', background: '#fff', color: '#e57373', fontSize: 13, cursor: coverSaving ? 'not-allowed' : 'pointer' }}
              >
                {t('eg.remove')}
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#c4a882', marginTop: 8 }}>{t('eg.coverHint')}</div>
        </div>

        {/* 成員管理 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 12 }}>{t('eg.members')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.members.map((uid, idx) => {
              const profile = group.memberProfiles?.[uid]
              const isCreatorMember = uid === group.createdBy
              const isRenaming = renamingUid === uid
              const isLast = idx === group.members.length - 1
              return (
                <div key={uid} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: isLast ? 'none' : '0.5px solid #f5ece4' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar
                      src={profile?.avatar}
                      name={profile?.name}
                      size={38}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: '#3d2b1f', fontWeight: 500 }}>{profile?.name}</div>
                      {isCreatorMember && (
                        <div style={{ fontSize: 11, color: '#FF8C42' }}>{t('eg.creator')}</div>
                      )}
                      {profile?.placeholder && (
                        <div style={{ fontSize: 11, color: '#b08060' }}>{t('eg.guestName')}</div>
                      )}
                      {user?.guest && uid === user.uid && (
                        <div style={{ fontSize: 11, color: '#b08060' }}>
                          {t('eg.inUse')}
                          <button
                            onClick={() => {
                              if (!confirm(t('eg.switchName'))) return
                              navigate(`/group/${id}`, { replace: true })
                              forgetGuestName(id)
                            }}
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: '#FF6B1A', textDecoration: 'underline', cursor: 'pointer' }}
                          >
                            {t('eg.notYou')}
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => { setRenamingUid(isRenaming ? null : uid); setRenameInput(profile?.name || '') }}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: '1px solid #f0d5c0', background: isRenaming ? '#fff3ec' : '#fff', color: isRenaming ? '#FF8C42' : '#b08060', fontSize: 12, cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      {isRenaming ? t('common.cancel') : t('eg.rename')}
                    </button>
                    {isCreator && !isCreatorMember && (
                      <button
                        onClick={() => handleRemoveMember(uid)}
                        disabled={removingUid === uid}
                        style={{
                          padding: '6px 12px', borderRadius: 8, border: '1px solid #f0d5c0', background: '#fff', color: '#e57373', fontSize: 12, cursor: 'pointer', flexShrink: 0,
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
                        style={{ flex: 1, minWidth: 0, border: '0.5px solid #FF8C42', borderRadius: 10, padding: '9px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
                      />
                      <button
                        onClick={() => handleRenameMember(uid)}
                        disabled={renameSaving || !renameInput.trim()}
                        style={{
                          padding: '9px 14px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                          background: renameSaving || !renameInput.trim() ? '#e0c4b0' : '#FF8C42',
                          color: '#fff',
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
              style={{ flex: 1, minWidth: 0, border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
            />
            <button
              onClick={handleAddPlaceholder}
              disabled={addingPlaceholder || !placeholderName.trim()}
              style={{
                padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 500, flexShrink: 0,
                cursor: addingPlaceholder || !placeholderName.trim() ? 'not-allowed' : 'pointer',
                background: addingPlaceholder || !placeholderName.trim() ? '#e0c4b0' : '#FF8C42', color: '#fff',
              }}
            >
              {addingPlaceholder ? t('eg.adding') : t('eg.add')}
            </button>
          </div>

          {!isCreator && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff8f4', borderRadius: 10, fontSize: 12, color: '#b08060' }}>
              {t('eg.onlyCreatorRemove')}
            </div>
          )}
        </div>

        {/* 退出群組（非建立者；訪客退出等於刪掉這個名字，不開放） */}
        {!isCreator && !user?.guest && (
          <button
            onClick={handleLeaveGroup}
            disabled={leaving}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 16, border: '1px solid #ffcdd2', background: '#fff',
              color: leaving ? '#b08060' : '#e57373', fontSize: 14, fontWeight: 500, cursor: leaving ? 'not-allowed' : 'pointer',
            }}
          >
            {leaving ? t('eg.leaving') : t('eg.leave')}
          </button>
        )}

        {/* 封存 / 刪除群組（建立者） */}
        {isCreator && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleArchiveToggle}
              disabled={archiving}
              style={{
                flex: 1, padding: '14px 0', borderRadius: 16, border: '1px solid #f0d5c0', background: '#fff',
                color: archiving ? '#b08060' : '#FF8C42', fontSize: 14, fontWeight: 500, cursor: archiving ? 'not-allowed' : 'pointer',
              }}
            >
              {archiving ? t('common.processing') : group.archived ? t('eg.unarchive') : t('eg.archive')}
            </button>
            <button
              onClick={handleDeleteGroup}
              disabled={deleting}
              style={{
                flex: 1, padding: '14px 0', borderRadius: 16, border: '1px solid #ffcdd2', background: '#fff',
                color: deleting ? '#b08060' : '#e57373', fontSize: 14, fontWeight: 500, cursor: deleting ? 'not-allowed' : 'pointer',
              }}
            >
              {deleting ? t('home.menu.deleting') : t('common.delete')}
            </button>
          </div>
        )}

      </div>

      {cropSrc && (
        <Suspense fallback={null}>
          <CropModal imageSrc={cropSrc} onCancel={closeCrop} onConfirm={handleCoverConfirm} />
        </Suspense>
      )}
    </div>
  )
}

export default EditGroupPage
