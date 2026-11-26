// LINE 官方帳號按鈕（圓形、白底 LINE 圖示），放在頂部列右側。直接導向（同 <a href>）；
// liff.openWindow 在三星雙開 LINE 的副本會被導回主 LINE。
import { OFFICIAL_ACCOUNT_URL } from '../config/liff'
import { useI18n } from '../i18n/I18nProvider'
import LineIcon from './LineIcon'

const OfficialAccountButton = () => {
  const { t } = useI18n()
  return (
    <button
      onClick={() => { window.location.href = OFFICIAL_ACCOUNT_URL }}
      aria-label={t('group.menu.official')}
      style={{ background: 'var(--cs-on-brand)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
    >
      <LineIcon size={22} />
    </button>
  )
}

export default OfficialAccountButton
