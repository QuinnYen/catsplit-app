// 帳本殼層提供給各頁的資料：目前帳本、帳戶、選取的日期、開啟記帳面板
import { createContext, useContext } from 'react'

export const LedgerContext = createContext(null)

export const useLedger = () => {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used inside LedgerShell')
  return ctx
}
