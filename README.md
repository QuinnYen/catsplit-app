# 🐱 CatSplit

> LINE LIFF 分帳應用程式，讓朋友之間的費用分攤變得簡單輕鬆。

---

## 功能

- 建立分帳群組，支援 Emoji 圖示選擇
- 透過邀請連結加入群組
- 新增費用並記錄誰付款、金額、備註
- 自動計算每位成員的應付金額
- 結算功能，清楚顯示誰欠誰多少錢
- 透過 LINE LIFF 整合，直接在 LINE 內使用

## 技術棧

- **Frontend** — React 19 + Vite + Tailwind CSS
- **Database** — Firebase Firestore
- **Auth** — LINE LIFF SDK
- **Hosting** — Firebase Hosting

## 開發環境設定

### 1. 安裝套件

```bash
npm install
```

### 2. 設定環境變數

複製 `.env.example` 為 `.env`，填入對應的值：

```bash
cp .env.example .env
```

```env
VITE_LIFF_ID=你的 LINE LIFF ID
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### 3. 啟動開發伺服器

```bash
npm run dev
```

## 部署

```bash
npm run build
firebase deploy
```

## 專案結構

```
src/
├── components/     # 共用元件
├── config/         # Firebase、LIFF 設定
├── context/        # React Context（全域狀態）
├── pages/          # 各頁面元件
└── assets/         # 圖片資源
```
