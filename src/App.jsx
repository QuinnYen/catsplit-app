import { Fragment, lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useApp } from './context/AppContext'
import GuestJoin from './components/GuestJoin'
import GoogleSignInButton from './components/GoogleSignInButton'
import NicknameSetupPage from './pages/NicknameSetupPage'
import { isLineUserAgent } from './utils/authSession'
import { useI18n } from './i18n/I18nProvider'
import catLogo from './assets/cat-logo.webp'
import useMyGroups from './hooks/useMyGroups'
import useSyncMemberProfile from './hooks/useSyncMemberProfile'
import useOfficialAccountPrompt from './hooks/useOfficialAccountPrompt'
import { pageTitleKey } from './utils/pageTitle'
import UpdateBanner from './components/UpdateBanner'

// 首頁與群組頁是主要落地頁（含邀請連結），直接載入；其餘頁面用到才下載
import HomePage from './pages/HomePage'
import PortalPage from './pages/PortalPage'
import GroupPage from './pages/GroupPage'
const CreateGroupPage = lazy(() => import('./pages/CreateGroupPage'))
const AddExpensePage = lazy(() => import('./pages/AddExpensePage'))
const SettlePage = lazy(() => import('./pages/SettlePage'))
const EditGroupPage = lazy(() => import('./pages/EditGroupPage'))
const MembersPage = lazy(() => import('./pages/MembersPage'))
const TransferPage = lazy(() => import('./pages/TransferPage'))
const EditExpensePage = lazy(() => import('./pages/EditExpensePage'))
const ExpenseDetailPage = lazy(() => import('./pages/ExpenseDetailPage'))
const PaymentMethodsPage = lazy(() => import('./pages/PaymentMethodsPage'))
const SpendMethodsPage = lazy(() => import('./pages/SpendMethodsPage'))
const SavingsListPage = lazy(() => import('./pages/SavingsListPage'))
const SavingsGoalFormPage = lazy(() => import('./pages/SavingsGoalFormPage'))
const SavingsGoalPage = lazy(() => import('./pages/SavingsGoalPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const MergePage = lazy(() => import('./pages/MergePage'))
const LinkPage = lazy(() => import('./pages/LinkPage'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))
const LedgerShell = lazy(() => import('./features/ledger/LedgerShell'))
const FxShell = lazy(() => import('./features/fx/FxShell'))

const LoadingScreen = () => {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--cs-bg)' }}>
      <div className="text-center">
        <img src={catLogo} alt={t('app.title')} style={{ width: 64, height: 64, marginBottom: 16 }} />
        <p style={{ color: 'var(--cs-text-sub)' }}>{t('common.loading')}</p>
      </div>
    </div>
  )
}

const LoginScreen = ({ onLogin, onGoogleLogin, guestGroupId }) => {
  const { t, lang } = useI18n()
  const [googleError, setGoogleError] = useState(false)
  // LINE 內建瀏覽器常擋 Google 登入，不顯示按鈕（要用 Google 的話，之後可在外部瀏覽器登入）
  const showGoogle = !isLineUserAgent(navigator.userAgent)
  const handleGoogleCredential = async (credential) => {
    setGoogleError(false)
    try {
      await onGoogleLogin(credential)
    } catch (e) {
      console.error('Google login failed', e)
      setGoogleError(true)
    }
  }
  return (
  <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, var(--cs-bg) 0%, var(--cs-soft-2) 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    {/* 中間：標誌、名稱、流程與登入按鈕，內容少的時候垂直置中 */}
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px 16px' }}>
    <img src={catLogo} alt={t('app.title')} style={{ width: 96, height: 96, marginBottom: 10 }} />
    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--cs-text)', marginBottom: 6 }}>{t('app.title')}</div>
    <div style={{ fontSize: 14, color: 'var(--cs-text-sub)', marginBottom: guestGroupId ? 24 : 16, textAlign: 'center', lineHeight: 1.6 }}>
      {guestGroupId ? t('login.invited') : t('login.tagline')}
    </div>

    {/* 三個步驟用一行小標籤帶過；邀請連結頁省略，讓訪客入口不用捲動就看得到 */}
    {!guestGroupId && (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
        {['login.flow1', 'login.flow2', 'login.flow3'].map((key, i) => (
          <Fragment key={key}>
            {i > 0 && <span aria-hidden="true" style={{ color: 'var(--cs-text-sub)' }}>›</span>}
            <span style={{ background: 'var(--cs-card)', border: '0.5px solid var(--cs-border)', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: 'var(--cs-text)' }}>{t(key)}</span>
          </Fragment>
        ))}
      </div>
    )}

    <button
      onClick={onLogin}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        background: '#06C755', color: '#fff', border: 'none', borderRadius: 6,
        padding: '14px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
        width: '100%', maxWidth: 320, boxShadow: '0 4px 16px rgba(6,199,85,0.25)',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--cs-on-brand)">
        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
      </svg>
      {t('login.button')}
    </button>
    {showGoogle && (
      <div style={{ marginTop: 12, width: '100%', maxWidth: 320 }}>
        <GoogleSignInButton onCredential={handleGoogleCredential} />
        {googleError && (
          <div role="alert" style={{ marginTop: 8, fontSize: 12, color: 'var(--cs-danger)', textAlign: 'center', lineHeight: 1.6 }}>{t('login.googleFailed')}</div>
        )}
      </div>
    )}
    {guestGroupId && (
      <div style={{ marginTop: 20, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <GuestJoin groupId={guestGroupId} />
      </div>
    )}

    </div>

    {/* 說明、使用條款與隱私權固定在畫面最下面：英文版是另一份靜態頁；中文版維持原網址。底部留出 iPhone 的安全區域 */}
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, padding: '12px 24px calc(16px + env(safe-area-inset-bottom))' }}>
      {[
        [lang === 'en' ? '/about.en.html' : '/about.html', t('login.about')],
        [lang === 'en' ? '/terms.en.html' : '/terms.html', t('home.menu.terms')],
        [lang === 'en' ? '/privacy.en.html' : '/privacy.html', t('home.menu.privacy')],
      ].map(([href, label]) => (
        <a key={href} href={href} style={{ color: 'var(--cs-text-sub)' }}>{label}</a>
      ))}
    </div>
  </div>
  )
}

// 不論從哪個網址進來（首頁、LINE 公告的群組連結…），登入後都把 LINE 頭像與名字同步到自己的群組
const ProfileSync = () => {
  const { groups, groupsLoaded } = useMyGroups()
  useSyncMemberProfile(groups, groupsLoaded)
  return null
}

// 登入後在任何頁面都檢查一次是否要請使用者加官方帳號好友
const OfficialAccountPrompt = () => {
  useOfficialAccountPrompt()
  return null
}

const ProtectedRoutes = () => {
  const { user, loading, loginWithLine, loginWithGoogle, switchGuestGroup, guestNames, needsNickname, nicknameLoading } = useApp()
  const location = useLocation()
  // 訪客進入另一個選過名字的群組時，先自動切換成該群組的名字再顯示頁面
  const pathGroupId = location.pathname.match(/^\/group\/([^/]+)/)?.[1]
  const needGuestSwitch = !!user?.guest && !!pathGroupId && pathGroupId !== user.groupId
    && guestNames.some(g => g.groupId === pathGroupId)
  useEffect(() => {
    if (needGuestSwitch) switchGuestGroup(pathGroupId)
  }, [needGuestSwitch, pathGroupId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || needGuestSwitch) return <LoadingScreen />
  // 登入後要回到原本開啟的頁面（例如邀請連結的群組頁）
  // 只有邀請連結（群組頁）提供訪客名字；訪客不能建立群組
  const inviteGroupId = location.pathname.match(/^\/group\/([^/]+)(?:\/add)?\/?$/)?.[1]
  if (!user) return <LoginScreen onLogin={() => loginWithLine(location.pathname + location.search)} onGoogleLogin={loginWithGoogle} guestGroupId={inviteGroupId} />
  // Google 帳號：先等雲端暱稱讀完；還沒有暱稱就先設定（LINE 使用者與訪客不經過這裡）
  if (nicknameLoading) return <LoadingScreen />
  if (needsNickname) return <NicknameSetupPage />

  return (
    <>
    {!user.guest && <ProfileSync />}
    {!user.guest && <OfficialAccountPrompt />}
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/home" element={<PortalPage />} />
      <Route path="/ledger/*" element={user.guest ? <Navigate to="/" /> : <LedgerShell />} />
      <Route path="/fx/*" element={<FxShell />} />
      <Route path="/create" element={user.guest ? <Navigate to="/" /> : <CreateGroupPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/merge" element={user.guest ? <Navigate to="/" /> : <MergePage />} />
      <Route path="/payment-methods" element={user.guest ? <Navigate to="/" /> : <PaymentMethodsPage />} />
      <Route path="/spend-methods" element={user.guest ? <Navigate to="/" /> : <SpendMethodsPage />} />
      <Route path="/savings" element={user.guest ? <Navigate to="/" /> : <SavingsListPage />} />
      <Route path="/savings/new" element={user.guest ? <Navigate to="/" /> : <SavingsGoalFormPage />} />
      <Route path="/savings/:goalId/edit" element={user.guest ? <Navigate to="/" /> : <SavingsGoalFormPage />} />
      <Route path="/savings/:goalId" element={user.guest ? <Navigate to="/" /> : <SavingsGoalPage />} />
      <Route path="/group/:id" element={<GroupPage />} />
      <Route path="/group/:id/add" element={<AddExpensePage />} />
      <Route path="/group/:id/settle" element={<SettlePage />} />
      <Route path="/group/:id/stats" element={<StatsPage />} />
      <Route path="/group/:id/transfer" element={<TransferPage />} />
      <Route path="/group/:id/expense/:expenseId" element={<ExpenseDetailPage />} />
      <Route path="/group/:id/expense/:expenseId/edit" element={<EditExpensePage />} />
      <Route path="/group/:id/income/:expenseId" element={<ExpenseDetailPage kind="income" />} />
      <Route path="/group/:id/income/:expenseId/edit" element={<EditExpensePage kind="income" />} />
      <Route path="/group/:id/edit" element={<EditGroupPage />} />
      <Route path="/group/:id/members" element={<MembersPage />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
    </>
  )
}

const AppRoutes = () => {
  const location = useLocation()
  // OAuth callback 路徑直接走 callback page，跳過登入檢查
  if (location.pathname === '/auth/callback') {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
      </Routes>
    )
  }
  // /link：從 LINE 內「用 Google 綁定」帶到外部瀏覽器的一次性連結，頁面自己兌換並登入，不經過登入檢查
  if (location.pathname === '/link') {
    return (
      <Routes>
        <Route path="/link" element={<LinkPage />} />
      </Routes>
    )
  }
  return <ProtectedRoutes />
}

// 網頁標題：貓咪分帳 | 頁面名稱（隨語言與頁面變動；不認得的頁面只顯示 app 名稱）
const PageTitle = () => {
  const { pathname } = useLocation()
  const { t } = useI18n()
  useEffect(() => {
    const key = pageTitleKey(pathname)
    document.title = key ? `${t('app.name')} | ${t(key)}` : t('app.title')
  }, [pathname, t])
  return null
}

const App = () => (
  <BrowserRouter>
    <PageTitle />
    <UpdateBanner />
    <Suspense fallback={<LoadingScreen />}>
      <AppRoutes />
    </Suspense>
  </BrowserRouter>
)

export default App
