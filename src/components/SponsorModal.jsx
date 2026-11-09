// 結算頁的「新增贊助」視窗：贊助人把錢送給指定成員（不算支出、不用還），只調整餘額。
import { useState } from 'react'
import { collection, doc, serverTimestamp, writeBatch, increment } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import Avatar from './Avatar'
import { CURRENCIES, getCurrency } from '../config/currencies'
import useExchangeRate from '../hooks/useExchangeRate'
import { useI18n } from '../i18n/I18nProvider'

const fieldStyle = { width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '9px 10px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }
const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 6 }

const SponsorModal = ({ group, groupId, onClose, onSaved }) => {
  const { user } = useApp()
  const { t, fmt } = useI18n()
  const baseCurrency = group.baseCurrency || 'TWD'
  const [sponsor, setSponsor] = useState(user?.uid && group.members.includes(user.uid) ? user.uid : group.members[0])
  const [currency, setCurrency] = useState(baseCurrency)
  const [amounts, setAmounts] = useState({}) // { uid: 輸入的字串 }
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const { exchangeRate, rateLoading } = useExchangeRate(currency, baseCurrency)

  const name = (uid) => group.memberProfiles?.[uid]?.name ?? t('common.someone')
  const recipientUids = group.members.filter(uid => uid !== sponsor)
  const original = Object.fromEntries(
    recipientUids.map(uid => [uid, parseFloat(amounts[uid]) || 0]).filter(([, v]) => v > 0)
  )
  const originalTotal = Object.values(original).reduce((s, v) => s + v, 0)
  const symbol = getCurrency(currency).symbol
  const canSubmit = originalTotal > 0 && exchangeRate != null && !rateLoading && !saving

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
      const rate = currency === baseCurrency ? 1 : exchangeRate
      const recipients = Object.fromEntries(Object.entries(original).map(([uid, v]) => [uid, parseFloat((v * rate).toFixed(2))]))
      const amount = parseFloat(Object.values(recipients).reduce((s, v) => s + v, 0).toFixed(2))
      // 贊助紀錄與餘額更新放同一個 batch，確保 recomputeGroupAggregates 的交易能偵測到
      const batch = writeBatch(db)
      batch.set(doc(collection(db, 'groups', groupId, 'sponsorships')), {
        from: sponsor,
        recipients,
        amount,
        originalRecipients: original,
        originalAmount: originalTotal,
        currency,
        exchangeRate: rate,
        note: note.trim(),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })
      const patch = { [`memberBalances.${sponsor}`]: increment(-amount) }
      Object.entries(recipients).forEach(([uid, v]) => { patch[`memberBalances.${uid}`] = increment(v) })
      batch.update(doc(db, 'groups', groupId), patch)
      await batch.commit()
      onSaved()
    } catch (error) {
      console.error('Failed to save sponsorship', error)
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--cs-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cs-card)', borderRadius: 6, padding: 16, width: '100%', maxWidth: 360, maxHeight: '100%', overflowY: 'auto' }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--cs-text)', marginBottom: 14 }}>{t('sponsor.title')}</div>

        <div style={labelStyle}>{t('sponsor.sponsor')}</div>
        <select value={sponsor} onChange={e => { setSponsor(e.target.value); setAmounts({}) }} style={{ ...fieldStyle, marginBottom: 14 }}>
          {group.members.map(uid => <option key={uid} value={uid}>{name(uid)}</option>)}
        </select>

        <div style={labelStyle}>{t('sponsor.currency')}</div>
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...fieldStyle, marginBottom: 14 }}>
          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>

        <div style={labelStyle}>{t('sponsor.recipients')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {recipientUids.map(uid => (
            <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar src={group.memberProfiles?.[uid]?.avatar} name={name(uid)} size={28} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(uid)}</div>
              <input
                type="number" inputMode="decimal" placeholder="0" value={amounts[uid] ?? ''}
                onChange={e => setAmounts(prev => ({ ...prev, [uid]: e.target.value }))}
                style={{ ...fieldStyle, width: 120, textAlign: 'right' }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--cs-text)', marginBottom: 12 }}>
          <span>{t('sponsor.total')}</span>
          <span style={{ fontWeight: 500 }}>{symbol} {fmt.num(originalTotal)}</span>
        </div>

        <input type="text" value={note} onChange={e => setNote(e.target.value)} maxLength={30} placeholder={t('sponsor.notePlaceholder')} style={{ ...fieldStyle, marginBottom: 8 }} />
        <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', marginBottom: 14 }}>{t('sponsor.hint')}</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 6, border: '0.5px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: 'pointer' }}>{t('common.cancel')}</button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit} style={{ flex: 2, padding: '11px 0', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 500, cursor: canSubmit ? 'pointer' : 'not-allowed', background: canSubmit ? 'var(--cs-rc-stamp)' : 'var(--cs-line-soft)', color: 'var(--cs-rc-stamp-text)' }}>{t('sponsor.submit')}</button>
        </div>
      </div>
    </div>
  )
}

export default SponsorModal
