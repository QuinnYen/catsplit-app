# 專案結構

```
src/
├── main.jsx                 # 入口；把 liff.state 換回真正路徑，包上 AppProvider
├── App.jsx                  # 路由（多數頁面 lazy）、登入畫面、訪客自動切換群組
├── config/                  # firebase、liff、幣別、記帳表單常數、群組圖示、收款方式清單與銀行代碼表
├── context/AppContext.jsx   # 全域 user 狀態、LINE / 訪客登入、認領、訪客名字記錄
├── hooks/                   # 匯率、Storage 圖片（以登入身分下載）
├── utils/                   # 分帳計算、群組彙總重算、刪除我的資料、Storage 清理、封面裁切
├── components/              # Avatar、TabBar、ExpenseForm、GuestJoin（訪客入口）、BankPicker、PaymentMethodModal…
└── pages/                   # Home、Group、AddExpense、Settle、Transfer、EditGroup、PaymentMethods…
functions/index.js           # lineLogin、verifyLiffToken、guestLogin、claimMember、detachMember、exportCsv、sharePage
firestore.rules              # Firestore 存取規則
storage.rules                # Storage 存取規則
storage-cors.json            # bucket CORS（需手動套用）
```

## 技術棧

- **Frontend** — React 19 + Vite + Tailwind CSS
- **Database / Storage** — Firebase Firestore、Firebase Storage
- **Auth** — LINE LIFF SDK / LINE Login，由 Cloud Functions 換發 Firebase custom token（見[身分與訪客](identity-and-guests.md)）
- **Backend** — Firebase Cloud Functions（`asia-east1`）
- **Hosting** — Firebase Hosting
