// 網址路徑 → 頁面名稱的 i18n key，用來組網頁標題（貓咪分帳 | 群組）；沒對到回 null（只顯示 app 名稱）
const ROUTES = [
  [/^\/$/, 'tab.split'],
  [/^\/home$/, 'tab.home'],
  [/^\/ledger$/, 'tab.ledger'],
  [/^\/ledger\/accounts$/, 'ledger.tab.accounts'],
  [/^\/ledger\/stats$/, 'ledger.chart'],
  [/^\/ledger\/settings$/, 'ledger.tab.settings'],
  [/^\/ledger\/settings\/recurring$/, 'ledger.set.recurring'],
  [/^\/ledger\/settings\/budget$/, 'ledger.set.budget'],
  [/^\/ledger\/settings\/categories$/, 'ledger.set.categories'],
  [/^\/fx$/, 'tab.fx'],
  [/^\/create$/, 'cg.title'],
  [/^\/settings$/, 'group.settings'],
  [/^\/merge$/, 'merge.title'],
  [/^\/payment-methods$/, 'pay.title'],
  [/^\/spend-methods$/, 'spend.title'],
  [/^\/savings$/, 'savings.title'],
  [/^\/savings\/new$/, 'savings.form.newTitle'],
  [/^\/savings\/[^/]+\/edit$/, 'savings.form.editTitle'],
  [/^\/savings\/[^/]+$/, 'savings.title'],
  [/^\/group\/[^/]+$/, 'tab.group'],
  [/^\/group\/[^/]+\/add$/, 'tab.addTitle'],
  [/^\/group\/[^/]+\/settle$/, 'settle.title'],
  [/^\/group\/[^/]+\/stats$/, 'stats.title'],
  [/^\/group\/[^/]+\/transfer$/, 'transfer.title'],
  // 支出與收入共用同一個標題（明細／編輯），不細分
  [/^\/group\/[^/]+\/(expense|income)\/[^/]+$/, 'app.pageDetail'],
  [/^\/group\/[^/]+\/(expense|income)\/[^/]+\/edit$/, 'common.edit'],
  [/^\/group\/[^/]+\/edit$/, 'group.menu.edit'],
  [/^\/group\/[^/]+\/members$/, 'eg.members'],
]

export const pageTitleKey = (pathname) => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return ROUTES.find(([re]) => re.test(path))?.[1] ?? null
}
