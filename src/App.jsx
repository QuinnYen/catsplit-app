import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useApp } from './context/AppContext'

const HomePage = lazy(() => import('./pages/HomePage'))
const CreateGroupPage = lazy(() => import('./pages/CreateGroupPage'))
const GroupPage = lazy(() => import('./pages/GroupPage'))
const AddExpensePage = lazy(() => import('./pages/AddExpensePage'))
const SettlePage = lazy(() => import('./pages/SettlePage'))
const JoinGroupPage = lazy(() => import('./pages/JoinGroupPage'))
const EditGroupPage = lazy(() => import('./pages/EditGroupPage'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))

const LoadingScreen = () => (
  <div className="flex items-center justify-center h-screen bg-gray-50">
    <div className="text-center">
      <div className="text-4xl mb-4">🐱</div>
      <p className="text-gray-500">載入中...</p>
    </div>
  </div>
)

const LoginScreen = ({ onLogin }) => (
  <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #fff8f4 0%, #ffe8d6 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
    <div style={{ fontSize: 80, marginBottom: 16, lineHeight: 1 }}>🐱</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: '#3d2b1f', marginBottom: 8 }}>CatSplit</div>
    <div style={{ fontSize: 14, color: '#b08060', marginBottom: 48, textAlign: 'center', lineHeight: 1.6 }}>
      貓咪幫你分帳，輕鬆搞定朋友借錢
    </div>

    <div style={{ background: '#fff', borderRadius: 20, border: '0.5px solid #f0d5c0', padding: '24px 20px', width: '100%', maxWidth: 320, marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#b08060', marginBottom: 16, textAlign: 'center' }}>如何開始使用</div>
      {[
        { icon: '💬', text: '使用 LINE 帳號登入' },
        { icon: '🐾', text: '建立或加入分帳群組' },
        { icon: '💰', text: '輕鬆記帳結算' },
      ].map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < 2 ? 14 : 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
            {step.icon}
          </div>
          <div style={{ fontSize: 14, color: '#3d2b1f' }}>{step.text}</div>
        </div>
      ))}
    </div>

    <button
      onClick={onLogin}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        background: '#06C755', color: '#fff', border: 'none', borderRadius: 14,
        padding: '14px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
        width: '100%', maxWidth: 320, boxShadow: '0 4px 16px rgba(6,199,85,0.25)',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
      </svg>
      使用 LINE 登入
    </button>
  </div>
)

const ProtectedRoutes = () => {
  const { user, loading, loginWithLine } = useApp()
  if (loading) return <LoadingScreen />
  if (!user) return <LoginScreen onLogin={loginWithLine} />

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/create" element={<CreateGroupPage />} />
      <Route path="/group/:id" element={<GroupPage />} />
      <Route path="/group/:id/add" element={<AddExpensePage />} />
      <Route path="/group/:id/settle" element={<SettlePage />} />
      <Route path="/group/:id/edit" element={<EditGroupPage />} />
      <Route path="/join/:id" element={<JoinGroupPage />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
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
  return <ProtectedRoutes />
}

const App = () => (
  <BrowserRouter>
    <Suspense fallback={<LoadingScreen />}>
      <AppRoutes />
    </Suspense>
  </BrowserRouter>
)

export default App
