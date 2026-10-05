# 貓咪分帳 CatSplit

> LINE LIFF 分帳應用程式，讓朋友之間的費用分攤變得簡單輕鬆。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white&labelColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white&labelColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white&labelColor=black)
![Firebase](https://img.shields.io/badge/Firebase-12-FFCA28?logo=firebase&logoColor=white&labelColor=black)
![LINE LIFF](https://img.shields.io/badge/LINE_LIFF-2-06C755?logo=line&logoColor=white&labelColor=black)

<p align="center">
  <img src="docs/images/cover.webp" alt="貓咪分帳 CatSplit 手機與桌面畫面" width="720">
</p>

---

## 功能

**群組**
- 建立分帳群組，支援圖示、底色與封面圖（可裁切）
- 透過邀請連結加入群組，上限 50 人；建立者可移除成員，成員可改暱稱、退出
- 群組可封存、刪除；首頁可「刪除我的資料」（退出所有群組，只有自己的群組整個刪除）
- 不想登入 LINE 的朋友可用訪客名字加入，見[身分與訪客](docs/identity-and-guests.md)

**記帳**
- 多幣別支出，自動換算匯率（匯率來自 open.er-api.com）
- 多人付款：一筆支出可由多人分別出資
- 五種分帳方式：均分、部分均分、份數、百分比、自訂金額
- 類別、備註、日期、收據照片；可編輯、刪除
- 明細可依類別篩選，或搜尋標題、備註、類別、付款人、金額
- 統計頁與 CSV 匯出

**結算**
- 結算總覽：用最少轉帳次數算出誰該轉給誰，並顯示每人明細
- 記錄轉帳（結清），可附付款方式與備註

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
VITE_TOKEN_EXCHANGE_URL=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_APPCHECK_SITE_KEY=   # 選填，reCAPTCHA v3 site key；沒設定則不啟用 App Check
```

`VITE_TOKEN_EXCHANGE_URL` 是 `lineLogin` 的網址；`verifyLiffToken`、`guestLogin`、`claimMember` 的網址由它把結尾換掉推算出來。

### 3. 啟動開發伺服器

```bash
npm run dev
```

本機開發模式會直接以假使用者登入，不經過 LINE。

## 部署

```bash
npm run build
firebase deploy
```

推送到 `main` 時由 GitHub Actions 部署 hosting、functions 與 rules。**若刪除或改名 function，CI 會因為不能互動刪除而中止**，需先手動 `firebase functions:delete <名稱> --region asia-east1`，再重跑部署。同理，**設定 `minInstances` 會增加最低帳單，CI 也會因為不能互動確認而中止**，需先在本機執行一次 `firebase deploy --only functions:<名稱>` 並確認費用。

## 文件

- [身分與訪客](docs/identity-and-guests.md)：LINE 使用者與訪客的差異、認領機制
- [啟動速度](docs/startup-performance.md)：登入快速路徑與載入策略，改啟動流程前請先看
- [安全與維運](docs/operations.md)：rules、CORS、換網域、備份、已知取捨與待辦
- [專案結構](docs/architecture.md)：目錄說明與技術棧
