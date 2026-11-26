// /ledger、/fx — 尚未開發的功能佔位頁（P12 個人記帳、匯率頁完成後換成正式頁面）。
import { useI18n } from '../i18n/I18nProvider'
import FeatureTabBar from '../components/FeatureTabBar'
import UserHeader from '../components/UserHeader'

const ComingSoonPage = ({ titleKey, descKey }) => {
  const { t } = useI18n()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <UserHeader />
      <div className="cs-body" style={{ padding: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--cs-text)', marginBottom: 12 }}>{t(titleKey)}</div>
        <div style={{ textAlign: 'center', padding: '56px 16px', background: 'var(--cs-rc-card)', border: '1px dashed var(--cs-rc-rule)', borderRadius: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cs-rc-ink)', marginBottom: 8 }}>{t('comingSoon.title')}</div>
          <div style={{ fontSize: 13, color: 'var(--cs-rc-sub)', lineHeight: 1.6 }}>{t(descKey)}</div>
        </div>
      </div>
      <FeatureTabBar />
    </div>
  )
}

export default ComingSoonPage
