# 專案結構

```
src/
├── main.jsx                 # 入口；把 liff.state 換回真正路徑，包上 AppProvider
├── App.jsx                  # 路由（多數頁面 lazy）、登入畫面、訪客自動切換群組
├── config/                  # firebase、liff、幣別、記帳表單常數、群組圖示、收款方式清單與銀行代碼表
├── context/AppContext.jsx   # 全域 user 狀態、LINE / 訪客登入、認領、訪客名字記錄
├── hooks/                   # 匯率、Storage 圖片（以登入身分下載）、我的群組（useMyGroups）
├── utils/                   # 分帳計算、群組彙總重算、預算狀態（budget.js）、刪除我的資料、Storage 清理、封面裁切
├── components/              # Avatar、TabBar、ExpenseForm、GuestJoin（訪客入口）、BankPicker、PaymentMethodModal…
└── pages/                   # Home、Group、AddExpense、Settle、Transfer、EditGroup、PaymentMethods…
functions/index.js           # lineLogin、verifyLiffToken、guestLogin、claimMember、detachMember、exportCsv、sharePage
firestore.rules              # Firestore 存取規則
firestore-tests/             # rules 測試（npm run test:rules，需模擬器）
storage.rules                # Storage 存取規則
storage-cors.json            # bucket CORS（需手動套用）
```

## 技術棧

- **Frontend** — React 19 + Vite + Tailwind CSS
- **Database / Storage** — Firebase Firestore、Firebase Storage
- **Auth** — LINE LIFF SDK / LINE Login，由 Cloud Functions 換發 Firebase custom token（見[身分與訪客](identity-and-guests.md)）
- **Backend** — Firebase Cloud Functions（`asia-east1`）
- **Hosting** — Firebase Hosting

## 網頁版版型

全站是 inline style，桌機置中的規則集中在 `src/index.css` 的單一 `@media (min-width: 481px)`，手機（≤480）不命中，版面完全不變。

- 頁面頂部與主體分別加 `cs-header`、`cs-body`、`cs-tabbar` class；規則用 `!important` 蓋過 inline style。
- header 與背景撐滿視窗；內容（`cs-body`）最寬 720 置中、單欄；TabBar 白底撐滿，按鈕群組置中 480。
- 數字要同步的地方：720（`.cs-header`、`.cs-body`、首頁頭像氣泡的 `left`）、480（`.cs-tabbar`、`CalculatorModal`、`InviteModal`、`GroupPage` 詳情面板）。
- 不要在 `#root` 或 `.cs-body` 加 `overflow`、`transform`、`contain`、`filter`，會破壞 `fixed` 的底部導覽列與浮層。
- 新頁面照既有頁面加上 `cs-header`／`cs-body` 即可。

