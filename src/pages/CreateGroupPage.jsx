// /create — 建立群組：設定名稱、圖示與結算基準貨幣（訪客不能進入）。
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import TabBar from '../components/TabBar'
import StickyFooter from '../components/StickyFooter'
import Avatar from '../components/Avatar'
import { CURRENCIES } from '../config/currencies'
import GroupIcon from '../components/GroupIcon'
import GroupIconPicker from '../components/GroupIconPicker'
import { DEFAULT_GROUP_ICON, DEFAULT_GROUP_COLOR } from '../config/groupIcons'

const CreateGroupPage = () => {
  const { user } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('TWD')
  const [icon, setIcon] = useState(DEFAULT_GROUP_ICON)
  const [iconColor, setIconColor] = useState(DEFAULT_GROUP_COLOR)
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const docRef = await addDoc(collection(db, 'groups'), {
        name: name.trim(),
        icon,
        iconColor,
        createdBy: user.uid,
        members: [user.uid],
        memberProfiles: {
          [user.uid]: {
            name: user.name,
            avatar: user.avatar ?? null,
          }
        },
        totalAmount: 0,
        totalExpenses: 0,
        memberExpenseCounts: {},
        baseCurrency,
      createdAt: serverTimestamp(),
      })
      navigate(`/group/${docRef.id}`)
    } catch (error) {
      console.error('Failed to create group', error)
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 80 }}>

      {/* Header */}
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ‹
          </button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('cg.title')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 群組名稱 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)' }}>{t('eg.name')}</div>
            <div style={{ fontSize: 11, color: 'var(--cs-text-mute)' }}>{name.length} / 20</div>
          </div>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('cg.namePlaceholder')}
            maxLength={20}
            style={{ width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
          />
        </div>

        {/* 基準貨幣 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 10 }}>{t('cg.baseCurrency')}</div>
          <select
            value={baseCurrency}
            onChange={e => setBaseCurrency(e.target.value)}
            style={{ width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
          >
            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} {t(c.labelKey)}</option>)}
          </select>
          <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', marginTop: 8 }}>
            {t('cg.baseCurrencyHint')}
          </div>
        </div>

        {/* 群組圖示 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 10 }}>{t('eg.icon')}</div>
          <GroupIconPicker
            icon={icon}
            color={iconColor}
            onChange={patch => { if (patch.icon) setIcon(patch.icon); if (patch.iconColor) setIconColor(patch.iconColor) }}
          />
        </div>

        {/* 預覽卡片 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 10 }}>{t('cg.preview')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <GroupIcon icon={icon} color={iconColor} size={48} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: name ? 'var(--cs-text)' : 'var(--cs-text-mute)' }}>
                {name || t('cg.previewName')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Avatar src={user?.avatar} name={user?.name} size={18} />
                {t('cg.previewMeta', { symbol: CURRENCIES.find(c => c.code === baseCurrency)?.symbol, code: baseCurrency })}
              </div>
            </div>
          </div>
        </div>

        {/* 建立按鈕：固定在底部導覽列上方，捲動時一直可見 */}
        <StickyFooter>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 6, border: 'none', fontSize: 15, fontWeight: 500, cursor: name.trim() && !loading ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
              background: name.trim() && !loading ? 'var(--cs-rc-stamp)' : 'var(--cs-line-soft)',
              color: 'var(--cs-rc-stamp-text)',
            }}
          >
            {loading ? t('cg.creating') : t('cg.create')}
          </button>
        </StickyFooter>
      </div>
      <TabBar context="create" />
    </div>
  )
}

export default CreateGroupPage