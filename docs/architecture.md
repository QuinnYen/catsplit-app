# 專案結構

```
src/
├── main.jsx                 # 入口；把 liff.state 換回真正路徑，包上 AppProvider
├── App.jsx                  # 路由（多數頁面 lazy）、登入畫面、訪客自動切換群組
├── config/                  # firebase、liff、google（OAuth 用戶端 ID）、貨幣與匯率（currencies.js，見 currency.md）、記帳表單常數、群組圖示、收款方式清單與銀行代碼表
├── context/AppContext.jsx   # 全域 user 狀態、LINE / 訪客登入、認領、訪客名字記錄
├── theme/                   # 暗黑模式：ThemeProvider、useTheme、主題判斷（theme.js）
├── hooks/                   # 匯率（useExchangeRate）、Storage 圖片（以登入身分下載）、我的群組（useMyGroups）
├── utils/                   # 登入工作階段判斷（authSession.js）、綁定與合併的 API 呼叫（identityApi.js）與確認頁顯示邏輯（mergeUi.js）、分帳計算、結算建議（settleSuggestions.js）、轉帳金額換算（transferAmounts.js）、頁面標題對照（pageTitle.js）、群組彙總重算、預算狀態（budget.js）、刪除我的資料、Storage 清理、封面裁切
├── components/              # Avatar、TabBar、ExpenseForm、CurrencySelect（選貨幣）、GuestJoin（訪客入口）、GoogleSignInButton（Google 登入按鈕）、LoginMethodsCard（設定頁登入方式）、BankPicker、PaymentMethodModal…
└── pages/                   # Home、Group、AddExpense、Settle、Transfer、EditGroup、PaymentMethods、NicknameSetup（Google 帳號首次設定暱稱）、Merge（帳號合併確認）…
functions/index.js           # lineLogin、verifyLiffToken、authExchange、listIdentities、bindIdentity、executeMerge、unbindIdentity、guestLogin、claimMember、detachMember、exportCsv、sharePage
functions/identity.js        # 身分對照純函式（identities 的 key、內部 uid、LINE／Google 查表決策、Google 登入換發流程），測試在 identity.test.js
functions/merge.js           # 帳號合併純函式（保留哪個 uid、群組分類、轉帳自付、個人資料衝突與解決方案），測試在 merge.test.js
functions/memberOps.js       # 成員搬移與合併的 Firestore 操作（migrateMember、反查群組、個人資料搬移、合併預覽），db 由呼叫端傳入；整合測試在 functions/emulator-tests/
functions/bind.js            # 綁定與合併的純函式（請求解析、綁定決策、解除綁定規劃、合併紀錄與狀態），測試在 bind.test.js
functions/mergeFlow.js       # 綁定、預覽、備份、分階段執行合併、解除綁定、清除過期紀錄（Firestore 操作，db 由呼叫端傳入）
functions/emulator-e2e/      # 從 HTTP 端點走完整身分流程的端到端測試（npm run test:e2e，需要含 functions 的模擬器）
functions/scripts/           # 補齊 identities 的腳本、本機模擬器用的 LINE、Google 驗證攔截檔（見 operations.md）
firestore.rules              # Firestore 存取規則
firestore-tests/             # rules 測試（npm run test:rules，需模擬器）
storage.rules                # Storage 存取規則
scripts/storage/            # bucket CORS 與生命週期設定（需手動套用，見 operations.md）
```

## 技術棧

- **Frontend** — React 19 + Vite + Tailwind CSS
- **Database / Storage** — Firebase Firestore、Firebase Storage
- **Auth** — LINE LIFF SDK / LINE Login、Google（Google Identity Services），由 Cloud Functions 驗證後換發 Firebase custom token（見[身分與訪客](identity-and-guests.md)）
- **Backend** — Firebase Cloud Functions（`asia-east1`）
- **Hosting** — Firebase Hosting

## 網頁版版型

全站是 inline style，桌機置中的規則集中在 `src/index.css` 的單一 `@media (min-width: 481px)`，手機（≤480）不命中，版面完全不變。

- 頁面頂部與主體分別加 `cs-header`、`cs-body`、`cs-tabbar` class；規則用 `!important` 蓋過 inline style。
- header 與背景撐滿視窗；內容（`cs-body`）最寬 720 置中、單欄；TabBar 白底撐滿，按鈕群組置中 480。
- 數字要同步的地方：720（`.cs-header`、`.cs-body`、首頁頭像氣泡的 `left`）、480（`.cs-tabbar`、`CalculatorModal`、`InviteModal`、`GroupPage` 詳情面板）。
- 不要在 `#root` 或 `.cs-body` 加 `overflow`、`transform`、`contain`、`filter`，會破壞 `fixed` 的底部導覽列與浮層。
- 新頁面照既有頁面加上 `cs-header`／`cs-body` 即可。

