// 個人帳本（P12）共用常數。設計見 docs/superpowers/specs/2026-11-14-p12-personal-ledger-design.md
import { DEFAULT_CATEGORIES } from '../../config/expenseForm.js'

export const MAX_LEDGERS = 20 // 前端限制，rules 無法計數
export const MAX_ACCOUNTS = 30 // 前端限制，rules 無法計數
export const LEDGER_NAME_MAX = 20
export const ACCOUNT_NAME_MAX = 20
export const TITLE_MAX = 50
export const NOTE_MAX = 50
export const CATEGORY_MAX = 30

export const TX_TYPES = ['income', 'expense', 'transfer']
// 使用者可建立的帳戶種類；快照帳戶（kind: 'group'）由系統建立，種類固定為 'group'
export const ACCOUNT_TYPES = ['cash', 'bank', 'credit', 'emoney', 'other']
export const SNAPSHOT_ACCOUNT_TYPE = 'group'

// 支出分類沿用群組；收入是個人專用的一組
export const EXPENSE_CATEGORIES = DEFAULT_CATEGORIES
export const INCOME_CATEGORIES = ['salary', 'bonus', 'investment', 'refund', 'other']
