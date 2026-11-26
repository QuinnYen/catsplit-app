// /ledger/* 的殼層：路由與底部導覽列。載入帳本與帳戶、記帳面板、提示由 LedgerProvider 提供（匯率頁也用它）。
import { Routes, Route, Navigate } from 'react-router-dom'
import { useLedger } from './LedgerContext'
import LedgerProvider from './LedgerProvider'
import LedgerTabBar from './LedgerTabBar'
import LedgerBookPage from './LedgerBookPage'
import LedgerSettingsPage from './LedgerSettingsPage'
import LedgerSettingsSubPage from './LedgerSettingsSubPage'
import LedgerAccountsPage from './LedgerAccountsPage'
import LedgerStatsPage from './LedgerStatsPage'

// 要在 Provider 底下才拿得到 openEntry（底部「記帳」鈕）
const LedgerRoutes = () => {
  const { openEntry } = useLedger()
  return (
    <>
      <Routes>
        <Route index element={<LedgerBookPage />} />
        <Route path="accounts" element={<LedgerAccountsPage />} />
        <Route path="stats" element={<LedgerStatsPage />} />
        <Route path="settings" element={<LedgerSettingsPage />} />
        <Route path="settings/:section" element={<LedgerSettingsSubPage />} />
        <Route path="*" element={<Navigate to="/ledger" replace />} />
      </Routes>
      <LedgerTabBar onAdd={() => openEntry(undefined)} />
    </>
  )
}

const LedgerShell = () => (
  <LedgerProvider>
    <LedgerRoutes />
  </LedgerProvider>
)

export default LedgerShell
