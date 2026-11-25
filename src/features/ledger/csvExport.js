// 個人帳本匯出成 CSV：整個帳本的全部帳目（收入、支出、轉帳），日期由舊到新。純函式，方便測試。
// 格式沿用群組匯出：開頭 BOM（Excel 開啟中文不亂碼）、文字欄位以 = + - @ 開頭時補單引號避免被當公式。
// 金額一律是正數，用「類型」欄區分收支；統計金額是帳本統計幣別，扣款金額是帳戶幣別（跨幣別帳目才有）。
import { escapeCell } from '../../utils/csvExport.js'
import { categoryName, resolveCategories } from './categories.js'

const BOM = String.fromCharCode(0xFEFF)
const createdMs = (tx) => tx.createdAt?.toMillis?.() ?? 0

const sourceLabel = (tx, t) => {
  if (tx.source?.type === 'recurring') return t('ledger.csv.srcRecurring')
  if (tx.source?.type !== 'group') return t('ledger.csv.srcManual')
  return tx.source.detached ? t('ledger.csv.srcImported') : t('ledger.csv.srcGroup')
}

/**
 * @param ledger       帳本（用到 baseCurrency）
 * @param accounts     帳戶 [{ id, name }]，帳戶 id 轉成名稱；找不到（已刪除）顯示 id
 * @param transactions 帳目 [{ id, ...fields }]
 * @param categories   帳本的類別清單（resolveCategories 的結果），類別名稱用它顯示；沒給就用預設清單
 * @param t            翻譯函式
 * @returns 含 BOM 的 CSV 文字
 */
export const buildLedgerCsv = ({ ledger, accounts, transactions, categories = resolveCategories([]), t }) => {
  const nameOf = (id) => accounts.find((a) => a.id === id)?.name ?? id ?? ''
  const header = [
    t('ledger.csv.type'), t('ledger.csv.date'), t('ledger.csv.title'), t('ledger.csv.category'), t('ledger.csv.account'),
    t('ledger.csv.amount'), t('ledger.csv.currency'), t('ledger.csv.baseAmount', { currency: ledger.baseCurrency }), t('ledger.csv.chargedAmount'),
    t('ledger.csv.toAccount'), t('ledger.csv.toAmount'), t('ledger.csv.note'), t('ledger.csv.source'),
  ]
  const sorted = [...transactions].sort((a, b) => (a.date === b.date ? createdMs(a) - createdMs(b) : a.date < b.date ? -1 : 1))
  const rows = sorted.map((tx) => {
    const transfer = tx.type === 'transfer'
    return [
      transfer ? t('ledger.kind.transfer') : t(`kind.${tx.type}`),
      tx.date,
      tx.title ?? '',
      !transfer && tx.category ? categoryName(categories, tx.type, tx.category, t) : '',
      nameOf(tx.accountId),
      tx.amount,
      tx.currency,
      transfer ? '' : tx.baseAmount ?? '',
      tx.accountAmount ?? '',
      transfer ? nameOf(tx.toAccountId) : '',
      transfer ? tx.toAmount ?? '' : '',
      tx.note ?? '',
      sourceLabel(tx, t),
    ]
  })
  return BOM + [header, ...rows].map((r) => r.map(escapeCell).join(',')).join('\n')
}

// 檔名：帳本名稱＋匯出日期（YYYYMMDD）；特殊字元由下載端與後端處理
export const ledgerCsvFileName = (ledger, now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${ledger.name}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`
}
