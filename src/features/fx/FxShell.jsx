// /fx/* 的殼層：計算機（首頁）、旅程列表、旅程明細。帳本資料與記帳面板由 LedgerProvider 提供（lite：不跑群組同步與固定收支補入）。
// 訪客沒有個人記帳：只有純換算的計算機，沒有旅程。
import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import LedgerProvider from '../ledger/LedgerProvider'
import FxCalculatorPage, { FxCalculatorGuest } from './FxCalculatorPage'
import TripListPage from './TripListPage'
import TripDetailPage from './TripDetailPage'
import FxSettingsPage from './FxSettingsPage'
import FxCurrenciesPage, { FxCurrenciesGuest } from './FxCurrenciesPage'
import TripTrashPage from './TripTrashPage'
import TrashAutoPurge from './TrashAutoPurge'

const FxShell = () => {
  const { user } = useApp()
  if (user.guest) {
    return (
      <Routes>
        <Route index element={<FxCalculatorGuest />} />
        <Route path="currencies" element={<FxCurrenciesGuest />} />
        <Route path="*" element={<Navigate to="/fx" replace />} />
      </Routes>
    )
  }
  return (
    <LedgerProvider lite>
      <TrashAutoPurge />
      <Routes>
        <Route index element={<FxCalculatorPage />} />
        <Route path="trips" element={<TripListPage />} />
        <Route path="trips/:tripId" element={<TripDetailPage />} />
        <Route path="settings" element={<FxSettingsPage />} />
        <Route path="currencies" element={<FxCurrenciesPage />} />
        <Route path="trash" element={<TripTrashPage />} />
        <Route path="*" element={<Navigate to="/fx" replace />} />
      </Routes>
    </LedgerProvider>
  )
}

export default FxShell
