// /fx/* 的殼層：旅程列表與旅程明細。帳本資料與記帳面板由 LedgerProvider 提供（lite：不跑群組同步與固定收支補入）。
// 訪客沒有個人記帳，不能用旅程（第四階段計算機完成後，訪客仍可使用純換算）。
import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import FeatureTabBar from '../../components/FeatureTabBar'
import UserHeader from '../../components/UserHeader'
import LedgerProvider from '../ledger/LedgerProvider'
import TripListPage from './TripListPage'
import TripDetailPage from './TripDetailPage'

const GuestNotice = () => {
  const { t } = useI18n()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <UserHeader />
      <div className="cs-body" style={{ padding: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--cs-text)', marginBottom: 12 }}>{t('fx.trips.title')}</div>
        <div style={{ textAlign: 'center', padding: '48px 16px', background: 'var(--cs-rc-card)', border: '1px dashed var(--cs-rc-rule)', borderRadius: 6, fontSize: 13, color: 'var(--cs-rc-sub)', lineHeight: 1.7 }}>{t('fx.guest')}</div>
      </div>
      <FeatureTabBar />
    </div>
  )
}

const FxShell = () => {
  const { user } = useApp()
  if (user.guest) return <GuestNotice />
  return (
    <LedgerProvider lite>
      <Routes>
        <Route index element={<TripListPage />} />
        <Route path="trips/:tripId" element={<TripDetailPage />} />
        <Route path="*" element={<Navigate to="/fx" replace />} />
      </Routes>
    </LedgerProvider>
  )
}

export default FxShell
