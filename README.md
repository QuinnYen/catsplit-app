# 貓咪分帳 CatSplit

> LINE LIFF 分帳應用程式，讓朋友之間的費用分攤變得簡單輕鬆。

---

## 功能

**群組**
- 建立分帳群組，支援圖示、底色與封面圖（可裁切）
- 透過邀請連結加入群組，上限 50 人；建立者可移除成員，成員可改暱稱、退出
- 群組可封存、刪除；首頁可「刪除我的資料」（退出所有群組，只有自己的群組整個刪除）
- 不想登入 LINE 的朋友可用訪客名字加入，見下方「身分與訪客」

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

## 技術棧

- **Frontend** — React 19 + Vite + Tailwind CSS
- **Database / Storage** — Firebase Firestore、Firebase Storage
- **Auth** — LINE LIFF SDK / LINE Login，由 Cloud Functions 換發 Firebase custom token
- **Backend** — Firebase Cloud Functions（`asia-east1`）
- **Hosting** — Firebase Hosting

## 身分與訪客

使用者有兩種身分，Firebase Auth 的 uid 不同：

| | LINE 使用者 | 訪客 |
|---|---|---|
| uid | LINE userId | `p_` 開頭的成員 id |
| 取得方式 | `lineLogin`（外部瀏覽器）或 `verifyLiffToken`（LINE 內）發 custom token | `guestLogin` 發 custom token，帶 `guest: true` claim |
| 能做什麼 | 建立、加入、退出群組 | 只能使用自己那個名字所在的群組 |

訪客的設計重點：

- **名字不鎖定**：訪客在邀請連結輸入名字，群組裡就多一位成員（`memberProfiles[id].placeholder = true`）。任何拿到連結的人都能選用既有名字，清快取或換裝置後再點一次就回來，不需要保管任何憑證。創群者也可以在「編輯群組」先新增名字。
- **不使用 Firebase 匿名登入**：匿名帳號的憑證只存在瀏覽器，清快取就失去身分，Auth 的匿名帳號自動清除也會依建立時間刪掉還在使用的人。
- **一次一個身分，最多 3 個群組**：瀏覽器把選過的名字記在 localStorage（`catsplit_guest_names`），進入其他群組時自動重新取得該群組的 token 切換。超過 3 個要求用 LINE 登入。
- **LINE 認領**（`claimMember`）：LINE 使用者可認領訪客名字，`migrateMember` 會把該名字在所有支出與轉帳裡的紀錄改成他的 LINE uid，名字從名單消失，之後只有本人能用。訪客自己綁定 LINE 時，瀏覽器記住的名字會一併認領。
- **Rules 限制訪客**：`isLineUser()` 以 `guest` claim 判斷，訪客不能建立群組、加入其他群組、退出群組。虛擬成員 id 以 `p_` 開頭，LINE userId 不含底線，不會撞號；成員新增虛擬成員的規則是 `addsPlaceholder()`。
- 訪客同名（忽略大小寫與全半形）會被拒絕，避免同一人變成兩個成員。

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

推送到 `main` 時由 GitHub Actions 部署 hosting、functions 與 rules。**若刪除或改名 function，CI 會因為不能互動刪除而中止**，需先手動 `firebase functions:delete <名稱> --region asia-east1`，再重跑部署。

## 安全與維運

上線時已做的防護，以及之後修改時要注意的地方。

### 存取控制

- **Firestore / Storage rules 是唯一的存取防線**（`firestore.rules`、`storage.rules`）。改 rules 後請用兩個帳號實測：加入、退出、建立者移除成員、改暱稱，以及訪客加入與認領。
- 群組成員名單只能減少一人（本人退出，或建立者移除他人）；新增成員只能由本人加入，或由成員新增虛擬成員，上限 50 人。
- **收據圖片受 rules 保護**：Firestore 只存 `receiptPath`（Storage 路徑），顯示時用 `getBlob()` 以登入身分下載。**不要改回 `getDownloadURL()` 並存進資料庫**，帶 token 的網址會繞過 rules，任何拿到網址的人都能看。群組封面仍使用帶 token 的網址（敏感度低）。

### Storage CORS

`getBlob()` 需要 bucket 設定 CORS，設定內容在 `storage-cors.json`，不會隨部署更新，需手動套用：

```bash
gcloud storage buckets update gs://catsplit-app.firebasestorage.app --cors-file=storage-cors.json
```

### 綁定正式網域時要一起改

漏改會導致登入或收據載入失敗。

1. `functions/index.js` 的 `ALLOWED_ORIGINS`
2. `storage-cors.json`，並重新執行上面的指令
3. LINE Developers 後台的 LIFF Endpoint URL 與 LINE Login Callback URL

### 備份與用量

- Firestore 已開啟時間點復原（PITR，保留 7 天）。**Storage 的收據圖片沒有備份**。
- Google Cloud 已設預算警示。
- Cloud Functions（`lineLogin`、`verifyLiffToken`、`guestLogin`、`claimMember`）為公開端點，已設 `maxInstances: 5`。

### 分帳計算

- 四捨五入的尾差歸最大出資者（不在分攤名單時歸第一位成員），確保各人份額總和等於總額。邏輯在 `applyExchangeRate`。
- 支出以 `payments`（誰出多少）與 `splits`（誰分攤多少）儲存，金額都換算成群組基準幣別。
- `npm test` 可跑 `expenseHelpers` 的單元測試。

### 已知取捨與未完成

**取捨**

- 已知漏洞：`@grpc/grpc-js`（firebase 間接相依，僅 Node 端使用，瀏覽器不載入）與 functions 的 `uuid`（邊界檢查，不受影響）。待上游更新後再升級。
- 每人可建立的群組數無法只靠 rules 限制，目前不限。
- 訪客名字不是專屬的，任何持有群組連結的人都能選用；`guestLogin` 沒有頻率限制，有人可以反覆輸入新名字塞滿群組（上限 50 人，建立者可移除）。
- LINE 使用者認領訪客名字後沒有復原機制。
- 清除瀏覽器資料後，訪客記住的名字會消失，需重新點群組連結選名字（帳目不受影響）。
- `memberExpenseCounts` 的舊資料補算只有 LINE 成員開首頁時才會執行。

**尚未完成**

- 公開上架：綁定正式網域、Search Console、LINE Developers 後台改為公開、可被搜尋的介紹頁與 meta 標籤、LINE 官方帳號入口。
- 小額捐款：選第三方管道（不自建金流），App 內與介紹頁放入口。
- App Check：程式已就緒（設 `VITE_APPCHECK_SITE_KEY` 才啟用）。啟用後先只看 metrics 一到兩週，確認正常流量都帶 token 再對 Firestore / Storage enforce。**不要一開始就 enforce**。
- 前端錯誤監控（Sentry 等）；接入後隱私權政策要補一句。
- Storage 備份：規模擴大後評估物件版本控制。
- 清除舊支出文件上不再使用的 `receiptUrl` 欄位。
- 想做的功能：一鍵開啟收款連結（收款連結要放 `groups/{id}/payInfo/{uid}`，不可放 `memberProfiles`）、逐項分帳、離線模式、經常性支出、多語言、收據 OCR。

## 專案結構

```
src/
├── main.jsx                 # 入口；把 liff.state 換回真正路徑，包上 AppProvider
├── App.jsx                  # 路由、登入畫面、訪客自動切換群組
├── config/                  # firebase、liff、幣別、記帳表單常數、群組圖示
├── context/AppContext.jsx   # 全域 user 狀態、LINE / 訪客登入、認領、訪客名字記錄
├── hooks/                   # 匯率、Storage 圖片（以登入身分下載）
├── utils/                   # 分帳計算、刪除我的資料、Storage 清理、封面裁切
├── components/              # Avatar、TabBar、ExpenseForm、GuestJoin（訪客入口）…
└── pages/                   # Home、Group、AddExpense、Settle、Transfer、EditGroup…
functions/index.js           # lineLogin、verifyLiffToken、guestLogin、claimMember
firestore.rules              # Firestore 存取規則
storage.rules                # Storage 存取規則
storage-cors.json            # bucket CORS（需手動套用）
```
