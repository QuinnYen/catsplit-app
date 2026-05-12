import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, arrayRemove, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import Avatar from '../components/Avatar'

const EditGroupPage = () => {
  const { id } = useParams()
  const { user } = useApp()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingUid, setRemovingUid] = useState(null)
  const [renamingUid, setRenamingUid] = useState(null)
  const [renameInput, setRenameInput] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  const handleDeleteGroup = async () => {
    if (!confirm(`確定刪除「${group.name}」？此操作無法復原，所有支出紀錄將一併刪除。`)) return
    setDeleting(true)
    try {
      const expensesSnap = await getDocs(collection(db, 'groups', id, 'expenses'))
      const batch = writeBatch(db)
      expensesSnap.docs.forEach(d => batch.delete(d.ref))
      batch.delete(doc(db, 'groups', id))
      await batch.commit()
      navigate('/')
    } catch (error) {
      console.error('刪除失敗', error)
      setDeleting(false)
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
        <div style={{ position: 'absolute', right: 10, bottom: -10, fontSize: 64, opacity: 0.12, userSelect: 'none' }}>🐾</div>
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
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>群組名稱</div>
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
          <div style={{ textAlign: 'right', fontSize: 11, color: '#c4a882', marginTop: 6 }}>{name.length} / 20</div>
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

          {!isCreator && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff8f4', borderRadius: 10, fontSize: 12, color: '#b08060' }}>
              只有建立者可以移除成員
            </div>
          )}
        </div>

        {/* 刪除群組 */}
        {isCreator && (
          <button
            onClick={handleDeleteGroup}
            disabled={deleting}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 16, border: '1px solid #ffcdd2', background: '#fff', color: deleting ? '#b08060' : '#e57373', fontSize: 14, fontWeight: 500, cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            {deleting ? '刪除中...' : '刪除群組'}
          </button>
        )}

      </div>
    </div>
  )
}

export default EditGroupPage
