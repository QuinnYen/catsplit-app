// Google 帳號首次登入：先設定顯示名稱（暱稱）才能進首頁。Google 帳號沒有 LINE 名字可當預設，所以暱稱不能留空；
// 預設帶 Google 上的名字（最多 20 字），之後可到設定頁修改。完成後 needsNickname 變 false，App.jsx 會自動進入首頁。
import { useState } from 'react'
import { useApp, NICKNAME_MAX_LENGTH } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import catLogo from '../assets/cat-logo.webp'

const NicknameSetupPage = () => {
  const { user, saveNickname, logout } = useApp()
  const { t } = useI18n()
  const [value, setValue] = useState(() => Array.from(user?.name || '').slice(0, NICKNAME_MAX_LENGTH).join(''))
  const [saving, setSaving] = useState(false)
  const canSave = value.trim().length > 0 && !saving

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      await saveNickname(value)
    } catch (error) {
      console.error('Failed to save nickname', error)
      alert(t('settings.nicknameFailed'))
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, var(--cs-bg) 0%, var(--cs-soft-2) 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <img src={catLogo} alt={t('app.title')} style={{ width: 96, height: 96, marginBottom: 16 }} />
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cs-text)', marginBottom: 8, textAlign: 'center' }}>{t('nicknameSetup.title')}</div>
      <div style={{ fontSize: 14, color: 'var(--cs-text-sub)', marginBottom: 24, textAlign: 'center', lineHeight: 1.6, maxWidth: 320 }}>{t('nicknameSetup.hint')}</div>

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          maxLength={NICKNAME_MAX_LENGTH}
          placeholder={t('settings.nicknamePlaceholder')}
          aria-label={t('settings.nickname')}
          style={{ border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '12px 14px', fontSize: 15, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-card)' }}
        />
        <button
          type="submit"
          disabled={!canSave}
          style={{ padding: '14px 32px', borderRadius: 6, border: 'none', fontSize: 16, fontWeight: 700, color: 'var(--cs-rc-stamp-text)', cursor: canSave ? 'pointer' : 'not-allowed', background: canSave ? 'var(--cs-rc-stamp)' : 'var(--cs-line-soft)' }}
        >
          {saving ? t('settings.nicknameSaving') : t('nicknameSetup.start')}
        </button>
      </form>

      <button
        onClick={logout}
        style={{ marginTop: 20, background: 'none', border: 'none', color: 'var(--cs-text-sub)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
      >
        {t('nicknameSetup.useOther')}
      </button>
    </div>
  )
}

export default NicknameSetupPage
