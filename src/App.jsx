import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './context/AppContext'

import HomePage from './pages/HomePage'
import CreateGroupPage from './pages/CreateGroupPage'
import GroupPage from './pages/GroupPage'
import AddExpensePage from './pages/AddExpensePage'
import SettlePage from './pages/SettlePage'
import JoinGroupPage from './pages/JoinGroupPage'

const App = () => {
  const { user, loading } = useApp()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4">🐱</div>
          <p className="text-gray-500">載入中...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4">🐱</div>
          <p className="text-gray-500">請先登入 LINE</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/create" element={<CreateGroupPage />} />
        <Route path="/group/:id" element={<GroupPage />} />
        <Route path="/group/:id/add" element={<AddExpensePage />} />
        <Route path="/group/:id/settle" element={<SettlePage />} />
        <Route path="/join/:id" element={<JoinGroupPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App