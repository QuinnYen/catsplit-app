// /group/:id/edit — 群組設定：改名稱、圖示與封面、預算，以及退出、封存或刪除群組（成員管理在 MembersPage）。
import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, collection, getDocs, writeBatch, deleteField } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { getCurrency } from '../config/currencies'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import GroupIconPicker from '../components/GroupIconPicker'
import { deleteGroupFiles } from '../utils/storageCleanup'
import { detachFromGroups } from '../utils/deleteMyData'

// 裁圖元件（含 react-easy-crop）選了圖片才需要
const CropModal = lazy(() => import('../components/CropModal'))

const EditGroupPage = () => {
  const { id } = useParams()
  const { user } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [iconSaving, setIconSaving] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [coverSaving, setCoverSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')
  const [budgetSaving, setBudgetSaving] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const snap = await getDoc(doc(db, 'groups', id))
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setGroup(data)
        setName(data.name)
        setBudgetInput(data.budget?.amount ? String(data.budget.amount) : '')
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

  // 群組預算（只有建立者能改，rules 也會擋）；單位為群組基準幣，第一版只有整個群組（trip）
  const handleSaveBudget = async () => {
    const amount = parseFloat(budgetInput)
    if (!(amount > 0) || budgetSaving) return
    setBudgetSaving(true)
    try {
      const budget = { amount, period: { type: 'trip' } }
      await updateDoc(doc(db, 'groups', id), { budget })
      setGroup(prev => ({ ...prev, budget }))
      setBudgetInput(String(amount))
    } catch (error) {
      console.error('Failed to save budget', error)
      alert(t('eg.budgetFailed'))
    }
    setBudgetSaving(false)
  }

  const handleClearBudget = async () => {
    if (budgetSaving) return
    setBudgetSaving(true)
    try {
      await updateDoc(doc(db, 'groups', id), { budget: deleteField() })
      setGroup(prev => ({ ...prev, budget: undefined }))
      setBudgetInput('')
    } catch (error) {
      console.error('Failed to clear budget', error)
      alert(t('eg.budgetFailed'))
    }
    setBudgetSaving(false)
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
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('group.menu.edit')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 群組名稱 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 16, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)' }}>{t('eg.name')}</div>
            <div style={{ fontSize: 11, color: 'var(--cs-text-mute)' }}>{name.length} / 20</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={20}
              style={{ flex: 1, border: '0.5px solid var(--cs-border)', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
            />
            <button
              onClick={handleSaveName}
              disabled={saving || !name.trim() || name.trim() === group.name}
              style={{
                padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                background: saving || !name.trim() || name.trim() === group.name ? 'var(--cs-line-soft)' : 'var(--cs-rc-stamp)',
                color: 'var(--cs-rc-stamp-text)',
              }}
            >
              {saving ? t('eg.saving') : t('common.save')}
            </button>
          </div>
        </div>

        {/* 預算（建立者） */}
        {isCreator && (() => {
          const budgetNum = parseFloat(budgetInput)
          const canSaveBudget = !budgetSaving && budgetNum > 0 && budgetNum !== group.budget?.amount
          return (
            <div style={{ background: 'var(--cs-card)', borderRadius: 16, border: '0.5px solid var(--cs-border)', padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 8 }}>{t('eg.budget')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, border: '0.5px solid var(--cs-border)', borderRadius: 10, padding: '0 12px', background: 'var(--cs-bg)' }}>
                  <span style={{ fontSize: 14, color: 'var(--cs-text-sub)', flexShrink: 0 }}>{getCurrency(group.baseCurrency).symbol}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={budgetInput}
                    onChange={e => /^\d{0,12}(\.\d{0,2})?$/.test(e.target.value) && setBudgetInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && canSaveBudget && handleSaveBudget()}
                    placeholder={t('eg.budgetPlaceholder')}
                    style={{ flex: 1, minWidth: 0, border: 'none', padding: '10px 0', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'transparent' }}
                  />
                </div>
                <button
                  onClick={handleSaveBudget}
                  disabled={!canSaveBudget}
                  style={{
                    padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 500, flexShrink: 0,
                    cursor: canSaveBudget ? 'pointer' : 'not-allowed',
                    background: canSaveBudget ? 'var(--cs-rc-stamp)' : 'var(--cs-line-soft)', color: 'var(--cs-rc-stamp-text)',
                  }}
                >
                  {budgetSaving ? t('eg.saving') : t('common.save')}
                </button>
                {group.budget && (
                  <button
                    onClick={handleClearBudget}
                    disabled={budgetSaving}
                    style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-danger)', fontSize: 13, flexShrink: 0, cursor: budgetSaving ? 'not-allowed' : 'pointer' }}
                  >
                    {t('eg.budgetClear')}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', marginTop: 8 }}>{t('eg.budgetHint')}</div>
            </div>
          )
        })()}

        {/* 群組圖示 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 16, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 10 }}>{t('eg.icon')}</div>
          <GroupIconPicker
            icon={group.icon}
            color={group.iconColor}
            onChange={handleChangeIcon}
            disabled={iconSaving}
          />
        </div>

        {/* 群組封面 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 16, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 10 }}>{t('eg.cover')}</div>
          <div style={{ fontSize: 13, color: 'var(--cs-text)', marginBottom: 10 }}>
            {coverSaving ? t('common.processing') : group.coverUrl ? t('eg.coverSet') : t('eg.coverNone')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: coverSaving ? 'var(--cs-line-soft)' : 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', cursor: coverSaving ? 'not-allowed' : 'pointer',
            }}>
              {group.coverUrl ? t('eg.coverChange') : t('eg.coverChoose')}
              <input type="file" accept="image/*" onChange={handleCoverFile} disabled={coverSaving} style={{ display: 'none' }} />
            </label>
            {group.coverUrl && (
              <button
                onClick={handleRemoveCover}
                disabled={coverSaving}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-danger)', fontSize: 13, cursor: coverSaving ? 'not-allowed' : 'pointer' }}
              >
                {t('eg.remove')}
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', marginTop: 8 }}>{t('eg.coverHint')}</div>
        </div>

        {/* 退出群組（非建立者；訪客退出等於刪掉這個名字，不開放） */}
        {!isCreator && !user?.guest && (
          <button
            onClick={handleLeaveGroup}
            disabled={leaving}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 16, border: '1px solid var(--cs-danger-border)', background: 'var(--cs-card)',
              color: leaving ? 'var(--cs-text-sub)' : 'var(--cs-danger)', fontSize: 14, fontWeight: 500, cursor: leaving ? 'not-allowed' : 'pointer',
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
                flex: 1, padding: '14px 0', borderRadius: 16, border: '1px solid var(--cs-border)', background: 'var(--cs-card)',
                color: archiving ? 'var(--cs-text-sub)' : 'var(--cs-rc-stamp)', fontSize: 14, fontWeight: 500, cursor: archiving ? 'not-allowed' : 'pointer',
              }}
            >
              {archiving ? t('common.processing') : group.archived ? t('eg.unarchive') : t('eg.archive')}
            </button>
            <button
              onClick={handleDeleteGroup}
              disabled={deleting}
              style={{
                flex: 1, padding: '14px 0', borderRadius: 16, border: '1px solid var(--cs-danger-border)', background: 'var(--cs-card)',
                color: deleting ? 'var(--cs-text-sub)' : 'var(--cs-danger)', fontSize: 14, fontWeight: 500, cursor: deleting ? 'not-allowed' : 'pointer',
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
