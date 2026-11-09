export const DEFAULT_CATEGORIES = ['food', 'transport', 'lodging', 'shopping', 'entertainment', 'daily', 'medical']
// 編輯支出頁：舊帳的類別可能還是已移除的 'other'（其他），不算自訂
export const EDIT_EXPENSE_CATEGORIES = [...DEFAULT_CATEGORIES, 'other']
export const NOTE_MAX_LENGTH = 50
export const DEFAULT_INCOME_CATEGORIES = ['refund', 'advance', 'subsidy', 'other']
// 贊助存在 incomes 集合（isSponsorship: true），類別固定為 sponsorship
export const DEFAULT_SPONSOR_CATEGORIES = ['sponsorship']
// 編輯收入頁可能開到贊助，兩種類別都不算自訂
export const EDIT_INCOME_CATEGORIES = [...DEFAULT_INCOME_CATEGORIES, ...DEFAULT_SPONSOR_CATEGORIES]
export const SPLIT_TYPES = [
  { key: 'equal',      labelKey: 'split.equal' },
  { key: 'subset',     labelKey: 'split.subset' },
  { key: 'shares',     labelKey: 'split.shares' },
  { key: 'percentage', labelKey: 'split.percentage' },
  { key: 'custom',     labelKey: 'split.custom' },
]
