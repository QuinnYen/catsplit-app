import { useEffect, useState } from 'react'
import { useApp, fetchGuestList, MAX_GUEST_NAMES } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'

const errorText = (t) => ({
  guest_limit: t('guest.limit', { max: MAX_GUEST_NAMES }),
  name_taken: t('guest.nameTaken'),
  group_full: t('guest.groupFull'),
  invalid_name: t('guest.invalidName'),
})

/**
 * 邀請連結的訪客入口：輸入自己的名字加入，或點選之前用過的訪客名字（名字不鎖定，換裝置再點一次即可）。
 * guests 不傳時自行向 guestLogin 取得（未登入時讀不到群組文件）。
 */
const GuestJoin = ({ groupId, guests: guestsProp }) => {
  const { loginAsGuest, joinAsGuest } = useApp()
  const { t } = useI18n()
  const [fetchedGuests, setFetchedGuests] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const guests = guestsProp ?? fetchedGuests ?? []

  useEffect(() => {
    if (guestsProp) return
    fetchGuestList(groupId)
      .then(data => setFetchedGuests(data.guests))
      .catch(e => console.error('Failed to fetch guest names', e))
  }, [groupId, guestsProp])

  const run = async (key, action) => {
    if (busy) return
    setBusy(key)
    setError('')
    try {
      await action()
    } catch (e) {
      console.error(e)
      setError(errorText(t)[e.message] || t('guest.failed'))
      setBusy(null)
    }
  }

  const submitName = () => name.trim() && run('new', () => joinAsGuest(groupId, name))

  return (
    <div style={{ width: '100%', maxWidth: 320, background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14, boxSizing: 'border-box' }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>{t('guest.title')}</div>

      {guests.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: '#c4a882', marginBottom: 8 }}>{t('guest.usedBefore')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {guests.map(g => (
              <button
                key={g.id}
                onClick={() => window.confirm(t('guest.confirmContinue', { name: g.name })) && run(g.id, () => loginAsGuest(groupId, g.id))}
                disabled={!!busy}
                style={{ padding: '7px 14px', borderRadius: 20, border: '0.5px solid #f0d5c0', background: busy === g.id ? '#FF8C42' : '#fff3ec', color: busy === g.id ? '#fff' : '#3d2b1f', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}
              >
                {g.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitName()}
          maxLength={20}
          placeholder={guests.length > 0 ? t('guest.newPlaceholder') : t('guest.namePlaceholder')}
          style={{ flex: 1, minWidth: 0, border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
        />
        <button
          onClick={submitName}
          disabled={!!busy || !name.trim()}
          style={{ padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 500, flexShrink: 0, color: '#fff', background: busy || !name.trim() ? '#e0c4b0' : '#FF8C42', cursor: busy || !name.trim() ? 'not-allowed' : 'pointer' }}
        >
          {busy === 'new' ? t('guest.joining') : t('guest.join')}
        </button>
      </div>

      {error && <div style={{ fontSize: 13, color: '#c0392b', marginTop: 8 }}>{error}</div>}
      <div style={{ fontSize: 11, color: '#c4a882', lineHeight: 1.5, marginTop: 10 }}>
        {t('guest.note1')}<br />
        {t('guest.note2', { max: MAX_GUEST_NAMES })}
      </div>
    </div>
  )
}

export default GuestJoin
