import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, arrayRemove, arrayUnion, collection, getDocs, writeBatch } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { useApp } from '../context/AppContext'
import Avatar from '../components/Avatar'
import GroupIconPicker from '../components/GroupIconPicker'
import PawDecor from '../components/PawDecor'
import { deleteGroupFiles } from '../utils/storageCleanup'

// 裁圖元件（含 react-easy-crop）選了圖片才需要
const CropModal = lazy(() => import('../components/CropModal'))

const EditGroupPage = () => {
  const { id } = useParams()
  const { user, forgetGuestName } = useApp()
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
      console.error('更新圖示失敗', error)
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
      // 先縮小，避免相機原圖過大塞爆 canvas；同時修正 EXIF 旋轉
      const { default: imageCompression } = await import('browser-image-compression')
      const resized = await imageCompression(file, { maxSizeMB: 1.5, maxWidthOrHeight: 1600, useWebWorker: true })
      setCropSrc(URL.createObjectURL(resized))
    } catch (error) {
      console.error('讀取圖片失敗', error)
    }
  }

  const deleteOldCover = async (url) => {
    if (!url) return
    try {
      await deleteObject(ref(storage, url))
    } catch (error) {
      console.warn('刪除舊封面失敗', error)
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
      await deleteOldCover(group.coverUrl)
      setGroup(prev => ({ ...prev, coverUrl }))
    } catch (error) {
      console.error('上傳封面失敗', error)
    }
    setCoverSaving(false)
  }

  const handleRemoveCover = async () => {
    if (!group.coverUrl || coverSaving) return
    setCoverSaving(true)
    try {
      await updateDoc(doc(db, 'groups', id), { coverUrl: null })
      await deleteOldCover(group.coverUrl)
      setGroup(prev => ({ ...prev, coverUrl: null }))
    } catch (error) {
      console.error('移除封面失敗', error)
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
      alert('群組已達 50 人上限')
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
      console.error('新增虛擬成員失敗', error)
      alert('新增失敗，請稍後再試')
    }
    setAddingPlaceholder(false)
  }

  const handleDeleteGroup = async () => {
    if (!confirm(`確定刪除「${group.name}」？此操作無法復原，所有支出紀錄將一併刪除。`)) return
    setDeleting(true)
    try {
      await deleteGroupFiles(id)
      const [expensesSnap, settlementsSnap] = await Promise.all([
        getDocs(collection(db, 'groups', id, 'expenses')),
        getDocs(collection(db, 'groups', id, 'settlements')),
      ])
      const batch = writeBatch(db)
      expensesSnap.docs.forEach(d => batch.delete(d.ref))
      settlementsSnap.docs.forEach(d => batch.delete(d.ref))
      batch.delete(doc(db, 'groups', id))
      await batch.commit()
      navigate('/')
    } catch (error) {
      console.error('刪除失敗', error)
      setDeleting(false)
    }
  }

  const handleArchiveToggle = async () => {
    const isArchived = !!group.archived
    const msg = isArchived
      ? `取消封存「${group.name}」？群組將重新顯示在列表中。`
      : `封存「${group.name}」？群組將從列表中隱藏，資料不會刪除。`
    if (!confirm(msg)) return
    setArchiving(true)
    try {
      await updateDoc(doc(db, 'groups', id), { archived: !isArchived })
      setGroup(prev => ({ ...prev, archived: !isArchived }))
    } catch (error) {
      console.error('封存操作失敗', error)
    }
    setArchiving(false)
  }

  const handleLeaveGroup = async () => {
    if (!confirm(`確定退出「${group.name}」？退出後將無法查看此群組。`)) return
    setLeaving(true)
    try {
      const updatedProfiles = { ...group.memberProfiles }
      delete updatedProfiles[user.uid]
      await updateDoc(doc(db, 'groups', id), {
        members: arrayRemove(user.uid),
        memberProfiles: updatedProfiles,
      })
      navigate('/')
    } catch (error) {
      console.error('退出群組失敗', error)
      setLeaving(false)
    }
  }

  const handleRemoveMember = async (uid) => {
    if (uid === group.createdBy) return
    if (!confirm(`確定移除「${group.memberProfiles?.[uid]?.name}」？`)) return
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
        載入中...
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
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>編輯群組</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 群組名稱 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060' }}>群組名稱</div>
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
              {saving ? '儲存中' : '儲存'}
            </button>
          </div>
        </div>

        {/* 群組圖示 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>群組圖示</div>
          <GroupIconPicker
            icon={group.icon}
            color={group.iconColor}
            onChange={handleChangeIcon}
            disabled={iconSaving}
          />
        </div>

        {/* 群組封面 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>群組封面</div>
          <div style={{ fontSize: 13, color: '#3d2b1f', marginBottom: 10 }}>
            {coverSaving ? '處理中...' : group.coverUrl ? '已設定封面' : '尚未設定封面'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: coverSaving ? '#e0c4b0' : '#FF8C42', color: '#fff', cursor: coverSaving ? 'not-allowed' : 'pointer',
            }}>
              {group.coverUrl ? '更換圖片' : '選擇圖片'}
              <input type="file" accept="image/*" onChange={handleCoverFile} disabled={coverSaving} style={{ display: 'none' }} />
            </label>
            {group.coverUrl && (
              <button
                onClick={handleRemoveCover}
                disabled={coverSaving}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #f0d5c0', background: '#fff', color: '#e57373', fontSize: 13, cursor: coverSaving ? 'not-allowed' : 'pointer' }}
              >
                移除
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#c4a882', marginTop: 8 }}>建議使用橫式照片，選圖後可拖曳與縮放調整範圍</div>
        </div>

        {/* 成員管理 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 12 }}>成員管理</div>
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
                        <div style={{ fontSize: 11, color: '#FF8C42' }}>建立者</div>
                      )}
                      {profile?.placeholder && (
                        <div style={{ fontSize: 11, color: '#b08060' }}>訪客名稱</div>
                      )}
                      {user?.guest && uid === user.uid && (
                        <div style={{ fontSize: 11, color: '#b08060' }}>
                          目前使用中，
                          <button
                            onClick={() => {
                              if (!confirm('換成其他名字？\n這個名字的帳目不會受影響。')) return
                              navigate(`/group/${id}`, { replace: true })
                              forgetGuestName(id)
                            }}
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: '#FF6B1A', textDecoration: 'underline', cursor: 'pointer' }}
                          >
                            不是你？
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
                      {isRenaming ? '取消' : '改名'}
                    </button>
                    {isCreator && !isCreatorMember && (
                      <button
                        onClick={() => handleRemoveMember(uid)}
                        disabled={removingUid === uid}
                        style={{
                          padding: '6px 12px', borderRadius: 8, border: '1px solid #f0d5c0', background: '#fff', color: '#e57373', fontSize: 12, cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        {removingUid === uid ? '移除中' : '移除'}
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
                        placeholder="輸入新名稱..."
                        style={{ flex: 1, border: '0.5px solid #FF8C42', borderRadius: 10, padding: '9px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
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
                        {renameSaving ? '儲存中' : '確認'}
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
              placeholder="新增訪客名字（朋友免登入使用）"
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
              {addingPlaceholder ? '新增中' : '新增'}
            </button>
          </div>

          {!isCreator && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff8f4', borderRadius: 10, fontSize: 12, color: '#b08060' }}>
              只有建立者可以移除成員
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
            {leaving ? '退出中...' : '退出群組'}
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
              {archiving ? '處理中...' : group.archived ? '取消封存' : '封存'}
            </button>
            <button
              onClick={handleDeleteGroup}
              disabled={deleting}
              style={{
                flex: 1, padding: '14px 0', borderRadius: 16, border: '1px solid #ffcdd2', background: '#fff',
                color: deleting ? '#b08060' : '#e57373', fontSize: 14, fontWeight: 500, cursor: deleting ? 'not-allowed' : 'pointer',
              }}
            >
              {deleting ? '刪除中...' : '刪除'}
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
