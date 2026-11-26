// 帳號選單的項目（設定、官方帳號、登出），頂部使用者列與底部列的頭像共用。close：選了項目後要收起選單。
import { useNavigate } from 'react-router-dom'
import { Settings, LogOut } from 'lucide-react'
import { OFFICIAL_ACCOUNT_URL } from '../config/liff'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import LineIcon from './LineIcon'

export const useAccountMenu = (close) => {
  const { user, logout } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const handleLogout = () => {
    close()
    if (confirm(user?.guest ? t('home.logoutConfirmGuest') : t('home.logoutConfirm'))) logout()
  }
  return [
    { Icon: Settings, label: t('group.settings'), onClick: () => { close(); navigate('/settings') } },
    { Icon: LineIcon, label: t('group.menu.official'), href: OFFICIAL_ACCOUNT_URL },
    { Icon: LogOut, label: t('home.menu.logout'), onClick: handleLogout },
  ]
}

export const menuItemStyle = (i) => ({ width: '100%', padding: '14px 4px', background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid var(--cs-rc-rule)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: 'var(--cs-rc-ink)', cursor: 'pointer', textAlign: 'left', textDecoration: 'none', boxSizing: 'border-box' })
