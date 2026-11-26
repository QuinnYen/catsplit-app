# 安全與維運

上線時已做的防護，以及之後修改時要注意的地方。

## 存取控制

- **Firestore / Storage rules 是唯一的存取防線**（`firestore.rules`、`storage.rules`）。改 rules 後請用兩個帳號實測：加入、退出、建立者移除成員、改暱稱，以及訪客加入與認領。
- 群組成員名單只能減少一人（本人退出，或建立者移除他人）；新增成員只能由本人加入，或由成員新增虛擬成員，上限 50 人。
- 群組預算 `budget` 只有建立者（`createdBy`）能設定、修改或清除，寫入時驗證結構（`amount` 為 0 到 1e12 之間的數字、`period` 為含 `type` 字串的 map、沒有其他欄位）；其他成員的一般記帳更新不受影響。建立者離開時 `createdBy` 轉給繼任者，管理權跟著轉移。
- **rules 自動化測試**：`npm run test:rules`（需要 Java）以 `--project demo-catsplit` 啟動 Firestore 模擬器並執行 `firestore-tests/*.mjs`，目前涵蓋預算權限與一般記帳、加入群組、新增虛擬成員、儲蓄目標、個人帳本（`ledger.rules.mjs`）。會使用 8080 埠，**執行前先關閉 `npm run emulators` 或其他模擬器**。兩個帳號的手動實測仍要做。**帳號合併的 Firestore 整合測試**用 `npm run test:merge`（同樣需要 Java 與模擬器，`functions/emulator-tests/`），涵蓋群組搬移、轉帳自付、個人資料搬移、重試安全與預覽；它與 `test:rules` 都用 8080 埠，不能同時執行。**身分綁定與合併的端到端測試**用 `npm run test:e2e`（`functions/emulator-e2e/`，從 HTTP 端點走完整流程），需要含 functions 的模擬器與假驗證預載檔，做法見下方「本機模擬器跑雲端函式」；它會先清空 Firestore 與 Auth 模擬器的資料。
- **收款方式**（`users/{uid}/paymentMethods`）：本人可讀寫；其他登入者只能讀 `isPublic == true` 的，列表查詢必須帶 `where('isPublic', '==', true)`。訪客不能寫。可見範圍的取捨見[收款方式](payment-methods.md)。
- **收據圖片受 rules 保護**：Firestore 只存 `receiptPath`（Storage 路徑），顯示時用 `getBlob()` 以登入身分下載。**不要改回 `getDownloadURL()` 並存進資料庫**，帶 token 的網址會繞過 rules，任何拿到網址的人都能看。群組封面仍使用帶 token 的網址（敏感度低）。

## Storage CORS

`getBlob()` 需要 bucket 設定 CORS，設定內容在 `scripts/storage/storage-cors.json`，不會隨部署更新，需手動套用：

```bash
gcloud storage buckets update gs://catsplit-app.firebasestorage.app --cors-file=scripts/storage/storage-cors.json
```

## 匯出 CSV（`exportCsv`）

CSV 內容由前端的 `src/utils/csvExport.js` 組出：明細（支出、收入、轉帳）加彙總（群組總額與「我」的收支），金額一律是群組基準幣。

LINE 內建瀏覽器無法下載 blob，所以在 LINE 裡匯出時：前端把 CSV 傳給 `exportCsv`，函式驗證登入與群組成員身分（個人帳本則驗證帳本屬於本人）後存到 Storage 的 `exports/`，回傳 **5 分鐘有效的簽名網址**（個人帳本還可存 JSON 備份檔，`format: 'json'`，上限 300 萬字元），LINE 內無法從網頁開啟外部瀏覽器（`liff.openWindow` 實測無效），所以前端自動複製這個網址並用彈窗提示，由使用者貼到手機瀏覽器的網址列下載；無法自動複製時改用輸入框顯示網址。一般瀏覽器仍直接下載，不經過函式。

首次部署前要手動設定兩件事（不會隨部署更新）：

1. **簽名權限**：函式用執行時的服務帳號簽網址，該帳號需要「Service Account Token Creator」，並啟用 IAM Service Account Credentials API。

   ```bash
   gcloud services enable iamcredentials.googleapis.com --project=catsplit-app
   SA=$(gcloud projects describe catsplit-app --format='value(projectNumber)')-compute@developer.gserviceaccount.com
   gcloud iam service-accounts add-iam-policy-binding $SA      --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator --project=catsplit-app
   ```

2. **自動清除**：`exports/` 底下的檔案 1 天後刪除（設定在 `scripts/storage/storage-lifecycle.json`）。這個指令會**取代整個 bucket 的生命週期設定**，目前沒有其他規則。

   ```bash
   gcloud storage buckets update gs://catsplit-app.firebasestorage.app --lifecycle-file=scripts/storage/storage-lifecycle.json
   ```

`storage.rules` 沒有 `exports/` 的規則，所以前端無法直接讀寫，只有函式（Admin SDK）能存取。

## 本機模擬器跑雲端函式

`npm run emulators` 只啟動 auth、firestore、storage，不含 functions。要實測登入、訪客、認領等雲端函式，另外啟動含 functions 的模擬器。LINE 與 Google 的驗證都需要連外，所以預載 `functions/scripts/emulator-mocks.mjs` 假冒它們：`verifyLiffToken` 的假 `idToken` 直接當成 LINE userId（例如 `U` 加 32 位十六進位）；`authExchange` 的假 `idToken` 直接當成 Google 的 sub（例如 `1122`），以 `bad` 開頭的會模擬驗證失敗。這個檔案只在本機以 `NODE_OPTIONS` 預載，不會被部署使用。

PowerShell，在專案根目錄：

```powershell
# 一次性：建立假的 secret（已被 .gitignore 的 *.local 排除，不會提交）
Set-Content functions/.secret.local "LINE_CHANNEL_SECRET=dummy"

# 啟動（路徑改成你的專案絕對路徑）
$env:NODE_OPTIONS = "--import file:///C:/path/to/catsplit-app/functions/scripts/emulator-mocks.mjs"
firebase emulators:start --only auth,firestore,functions,storage --project demo-catsplit
```

函式網址為 `http://127.0.0.1:5001/demo-catsplit/asia-east1/<函式名>`，例如 `verifyLiffToken`、`guestLogin`。Firestore 觸發器（訪客 Auth 清理）也會一併載入。需要 Java、Node 22，且 8080、9099、5001 埠不能被占用（執行 `npm run test:rules` 前要先關掉）。

## 群組彙總檢查與修復

群組文件上的彙總（`totalAmount`、`totalExpenses`、`totalIncome`、`incomeCount`、`memberBalances`、`memberExpenseCounts`）由客戶端新增帳目時用 `increment` 更新、編輯與刪除時整批重算，真正的來源是三個子集合的全部帳目（見 [`data-model.md`](data-model.md) 第 3 節）。**餘額對不上、或懷疑資料有問題時，用這個工具比對。**

到 GitHub 的 **Actions** 頁面選 **Check group aggregates** → **Run workflow**（只能在 `main` 上執行）：

1. 預設是 **dry-run**：列出哪些群組對不上、差在哪個欄位與成員（存的值與重算值），不寫入任何資料。結果在這次執行的 Summary。
2. 確認無誤後，勾選 **apply** 再執行一次，才會把重算的值寫回。也可以在 **group** 欄填一個群組 id，只處理那個群組。
3. 可重複執行。寫回時以讀到的版本為前提：掃描與寫入之間群組被改過（有人剛記帳）就跳過那個群組，結果會標示 `changed`，再跑一次即可，不會蓋掉剛新增的帳目。

重算用客戶端同一份 `computeGroupAggregates`（`src/utils/expenseHelpers.js`），所以工具和 App 的算法不會分歧。金額與餘額寫回時取到分。差異容忍 0.005（浮點誤差不算）；沒存的欄位視為 0。

**寫回前請先把 dry-run 的 Summary 存下來**（裡面有每個欄位修復前的值），需要還原時有依據。工具只會改這六個欄位，不動成員、名稱、預算等。

本機對模擬器執行（先 `$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"`）：

```powershell
cd functions
node scripts/check-aggregates.mjs --project demo-catsplit
```

測試：純函式 `functions/aggregates.test.js`（`npm test`）、Firestore 整合測試 `functions/emulator-tests/aggregateCheck.mjs`（`npm run test:merge`，含「寫入前被改過就跳過」）。

## 已完成的一次性遷移（歷史紀錄）

2026-11-23 做過兩次一次性的資料遷移，**已全部完成並驗證，相關程式已移除**（需要時可從 git 歷史取回，commit `00e87f3` 有完整的腳本、工作流程與測試）：

- **補齊 `identities` 對照項**：為既有的 LINE 使用者補上對照項（當時 5 筆）。
- **舊 LINE uid 轉成內部 uid**：6 位舊使用者（uid 就是 LINE userId）的群組、帳目、個人資料、對照項全部轉成 `u_` 開頭的內部 uid，轉移前有備份，轉完用群組彙總檢查驗證餘額沒變。

現在所有帳號 uid 都是 `u_` 開頭（訪客是 `p_`），沒有以 LINE userId 當 uid 的帳號，登入時對照表沒有項目就是全新的使用者。

## 帳號綁定與合併（維運）

端點與流程見[身分與訪客](identity-and-guests.md)。維運時要知道的事：

- **進行中或卡住的合併**：Firestore Console 的 `merges/{id}`，`state` 不是 `done` 就是還沒完成。使用者用同一個 `mergeId` 再按一次確認就會從斷點繼續（`failedGroups` 有值代表哪些群組失敗）；`lease` 有值且 `untilMs` 在未來，代表上一次還在執行，約 6 分鐘後可重試。`error` 欄位是上一次失敗的原因。
- **備份**：`mergeBackups/{mergeId}`，子集合 `groupDocs`（被併入帳號所在群組的改動前內容，含會被刪除的自付轉帳）、`personal`（個人資料）、`keepOverwritten`（被覆蓋的保留帳號文件）；meta 的 `dropIdentities`、`dropUserDoc` 是被併入帳號的對照項與 `users` 文件。保留 30 天。**沒有一鍵還原**，要還原就依內容用腳本寫回。
- **自動清除**：`.github/workflows/purge-merge-backups.yml` 每天 19:37（UTC）執行，刪除過期的 `merges`、`mergeBackups`（含子集合）與一次性連結碼 `linkCodes`。到 Actions 頁面可手動執行，預設 dry-run，勾選 `apply` 才真的刪；腳本是 `functions/scripts/purge-merge-backups.mjs`。進行中的合併不會被刪。`executeMerge` 每次也會順便清幾筆當備援。
- **為什麼不用 Cloud Scheduler 排程函式**：部署它需要額外啟用 API 與權限，部署失敗會連帶讓所有函式部署失敗；GitHub Actions 沿用已有的服務帳號，沒有額外風險。
- **同時合併的限制**：同一對帳號固定同一份 `merges` 紀錄；任一帳號有進行中的其他合併時，新的預覽會被拒絕。這個檢查不是交易，兩個極短時間內同時開始的不同合併理論上可能都通過，因為兩個預覽都需要使用者本人通過兩邊驗證，風險很低。
- **憑證驗證**：Google ID token 簽發 10 分鐘內才接受；呼叫者本身的 session 只要是有效的 Firebase ID token（不另外要求剛登入）。

### 綁定與合併的手動驗證（上線後第一次用之前）

合併會刪除一個帳號，**請先用兩個不重要的測試帳號走一遍**（例如一個全新的 LINE 帳號加一個全新的 Google 帳號），確認每一步正常再用真實資料。真實的 LINE 與 Google 驗證只能在正式環境測。

1. **綁定（兩邊都是新帳號時直接綁定）**：用外部瀏覽器以 Google 登入（新帳號，設定暱稱）→ 設定頁「登入方式」→「綁定 LINE 帳號」→ LINE 授權後回到設定頁，應顯示「綁定完成」，清單有 LINE 與 Google 兩列。
2. **用任一種登入都是同一個帳號**：登出，分別用 LINE 與 Google 登入，群組與資料相同。
3. **解除綁定**：清單有兩列時才有「解除綁定」；解除其中一個後只剩一列、沒有解除按鈕。再綁定回來。
4. **合併**：準備兩個各自有資料的帳號（各建一個群組、記一筆帳；其中一個群組讓兩邊都加入更好），在其中一個帳號的設定頁綁定另一個。應進入「合併帳號」確認頁，檢查摘要數字、暱稱選項（兩邊暱稱要不同才會出現），確認合併後：
   - 若你目前登入的帳號被併入，畫面會自動換成合併後的帳號並回到設定頁（顯示「帳號合併完成」）。
   - 兩邊的群組、帳目、收款方式、儲蓄目標都在；兩個帳號互相的轉帳不見了，餘額沒變。
   - 被併入的帳號用原本的登入方式再登入，進的是合併後的帳號。
5. **備份**：Firestore Console 的 `mergeBackups/{id}` 有資料、`merges/{id}` 的 `state` 是 `done`。
5b. **LINE 內綁定 Google**：在 LINE 內的設定頁按「用 Google 綁定」，畫面應顯示「連結已產生」與「複製連結」。按「複製連結」後貼到手機瀏覽器（不限 Chrome）的網址列，顯示「正在登入…」後進入設定頁並提示「已用你的 LINE 帳號登入」，按 Google 按鈕完成綁定（瀏覽器沒登入 Google 就登入一次）；切回 LINE 後清單應出現 Google。同一個連結第二次開啟應顯示「無效或已經使用過」。
6. **刪除我的資料**：合併後的帳號刪除資料，`identities`、`merges`、`mergeBackups` 都應清空。

## Google 登入設定

Google 登入用 Google Identity Services 取得 ID token，由 `authExchange` 驗證，**不使用 Firebase Authentication 的 Google 提供者**，所以不需要在 Firebase Console 開啟 Google 登入，也不需要用戶端密鑰。

- **OAuth 用戶端 ID**：在 Google Cloud Console（專案 `catsplit-app`）→ API 與服務 → 憑證建立「網頁應用程式」類型的 OAuth 用戶端。用戶端 ID 不是機密，直接寫在 `functions/index.js` 的 `GOOGLE_CLIENT_ID` 與 `src/config/google.js`，兩處必須相同（後端用它當 audience 驗證 token）。
- **已授權的 JavaScript 來源**：`https://catsplit-app.web.app`、`https://catsplit-app.firebaseapp.com`、`http://localhost:5173`；重新導向 URI 留空。
- **OAuth 同意畫面**：使用者類型「外部」，只用 `openid`、`email`、`profile`；**發布狀態必須是「正式版」**，停在「測試中」時只有手動加入的測試使用者能登入。
- 登入畫面在 LINE 內建瀏覽器不顯示 Google 按鈕（常被擋）。
- PR 預覽網址（`catsplit-app--pr-…web.app`）不在授權來源裡，而且預覽只部署 hosting，所以 Google 登入只能在合併部署後的正式網站實測。

## 綁定正式網域時要一起改

漏改會導致登入或收據載入失敗。

1. `functions/index.js` 的 `ALLOWED_ORIGINS`
2. `scripts/storage/storage-cors.json`，並重新執行上面的指令
3. LINE Developers 後台的 LIFF Endpoint URL 與 LINE Login Callback URL
4. Google Cloud Console 的 OAuth 用戶端「已授權的 JavaScript 來源」

## 備份與用量

- Firestore 已開啟時間點復原（PITR，保留 7 天）。**Storage 的收據圖片沒有備份**。
- Google Cloud 已設預算警示。
- **訪客 Auth 紀錄自動清理**：Firestore 觸發器 `cleanupGuestsOnGroupDelete`（群組被刪；同時補刪留下的子集合與 Storage 收據、封面，所以在 Console 手動刪群組文件也會清乾淨）與 `cleanupGuestsOnMemberRemoved`（成員離開 `members`）會刪除 `p_` 開頭訪客的 Auth 紀錄；LINE 使用者的 Auth 不會被這兩個觸發器動到。觸發器 region 設為 `asia-east1`，**必須與 Firestore 資料庫位置相同**，否則部署會失敗。`cleanupGuestsOnMemberRemoved` 在每次群組文件更新（含每筆記帳）都會執行一次，只在 `members` 有人離開時才會刪除。
- **UID 對照表 `users/{uid}`**：`lineLogin`、`verifyLiffToken` 每次登入會用 Admin SDK 寫入 `{ name, avatar, updatedAt }`，讓你在 Firestore Console 用 UID 反查是誰（Auth 的 Console 看不到 `displayName`）。rules 沒有開放這份文件（只開 `paymentMethods` 子集合），客戶端讀寫都被拒。`detachMember` 在 `deleteAccount` 成功後會一併刪除。App 快速登入路徑不會呼叫函式，所以要重新走完整登入才會更新。
- **身分對照表 `identities/{provider:subject}`**：`lineLogin`、`verifyLiffToken` 登入時用 transaction 查表，沒有項目就用新的內部 uid 建立；`identities`、`merges`、`mergeBackups` 客戶端讀寫一律被拒（`firestore-tests/identities.rules.mjs`）。補齊現有使用者見下方「身分對照表補齊」。
- **Google 登入 `authExchange`**：驗證 Google ID token（簽章與 audience）後，以 `identities/google:{sub}` 查表或建立內部 uid（`u_…`），發 custom token。查表與建立在 transaction 內，同一個 Google 帳號並行首次登入也只會有一個 uid；Google 沒有舊 uid 可沿用，所以查表失敗時直接回 500，不像 LINE 登入有退路。設定見下方「Google 登入設定」。
- **刪除帳號時清除對照項**：`detachMember` 在 `deleteAccount` 成功後，依序刪 Auth、`users/{uid}`、`identities`（`uid` 等於自己的所有項目）。對照項放在最後，因為先刪對照項再刪 Auth 若中途失敗，Google 使用者下次登入會被配到新的 uid，舊資料就找不回來。
- Cloud Functions（`lineLogin`、`verifyLiffToken`、`authExchange`、`listIdentities`、`bindIdentity`、`executeMerge`、`unbindIdentity`、`guestLogin`、`claimMember`、`detachMember`、`exportCsv`、`sharePage`）為公開端點，已設 `maxInstances: 5`。

## 分帳計算

- 四捨五入的尾差歸最大出資者（不在分攤名單時歸第一位成員），確保各人份額總和等於總額。邏輯在 `applyExchangeRate`。
- 支出以 `payments`（誰出多少）與 `splits`（誰分攤多少）儲存，金額都換算成群組基準幣別。貨幣、匯率、轉帳幣別與金額取整的細節見[貨幣與匯率](currency.md)。
- 群組彙總欄位（`totalAmount`、`totalExpenses`、`memberBalances`、`memberExpenseCounts`）：新增支出與轉帳用 `increment()`；編輯、刪除支出與刪除轉帳都透過 `src/utils/groupAggregates.js` 的 `recomputeGroupAggregates` 讀取全部子集合後重算並寫回（計算在 `computeGroupAggregates`）。重算使用 `runTransaction`：先讀群組文件，再讀子集合，最後寫回；`getDocs` 不在交易的讀取集合內，正確性只靠群組文件的版本。前提是所有影響彙總的寫入，不是在 batch 裡同時寫群組文件（新增支出、新增轉帳），就是寫入後重算（編輯、刪除）。例外：雲端函式 `migrateMember` 不是交易，可能蓋掉同時發生的寫入（既有問題，尚未處理）。
- 收入存在 `groups/{id}/incomes`，是反向的支出：`balance += splits − received`（分得者加、收款者減），與支出、轉帳一起算進 `memberBalances`。換算成基準幣別時，尾差歸最大收款者（重用 `applyExchangeRate`，把 `received` 當 `payments`）。
- 收入另有群組彙總欄位 `totalIncome`（各筆 `amount` 加總）與 `incomeCount`；`totalAmount` 仍是純支出。新增收入用 `increment()`（與新增支出一樣，必須和群組文件在同一個 batch）；編輯、刪除收入走 `recomputeGroupAggregates`。只有讀過 `incomes` 的重算才會寫這兩個欄位（沒有收入時寫 0），舊群組沒有這兩個欄位時讀取一律當 0。
- 上面「所有影響彙總的寫入」的前提同樣適用於收入；`migrateMember` 例外同樣適用（也會轉移 `incomes` 裡的 uid，但不是交易）。
- 群組預算（第一版只有整個群組，`budget = { amount, period: { type: 'trip' } }`，單位為基準幣）：已用 = 淨額（支出 − 收入），由 `src/utils/budget.js` 的 `computeBudgetStatus` 判斷，`spent` 先四捨五入到兩位，80% 起為警告、100% 起為超支。資料來源有兩種：群組頁的進度條用已訂閱的 `expenses`／`incomes` 清單加總（與總額卡的淨支出一致）；首頁的超支徽章與記帳頁的提示用群組彙總欄位 `totalAmount − totalIncome`（不額外讀帳目，編輯則以新金額替換原帳目）。彙總欄位在編輯後到重算完成前會短暫落後，兩處可能暫時不一致，以群組頁為準。
- `npm test`（`node --test`）會跑 `expenseHelpers`、`budget`、`currencies`、`settleSuggestions`、`transferAmounts`、`pageTitle`、i18n 與 `functions/migrate.js` 等單元測試。

## 快取標頭（部署後使用者拿到舊版）

- Firebase Hosting 對沒有設定標頭的內容預設 `Cache-Control: max-age=3600`。這個站是單頁應用，`/`、`/ledger`、`/group/xxx` 都由 `index.html` 回應，**請求網址不是 `/index.html`**，所以只替 `/index.html` 設 `no-store` 對不上，部署後使用者最多一小時內還會拿到舊的 HTML，連到舊的 JS（曾因此出現「已修好的 bug 在正式站仍然存在」）。
- `firebase.json` 的 `hosting.headers` 因此逐一列出每個會回傳 `index.html` 的網址（`/`、`/home`、`/ledger/**`、`/group/**`…）設 `no-cache`（每次向伺服器驗證，沒變就 304，很便宜）；`/assets/**`（檔名帶雜湊）維持 `immutable` 長期快取，兩者**互不重疊**，因為官方文件沒有說明多條規則設同一個標頭時誰優先。
- **新增路由時要把網址加進 `firebase.json`**。`src/utils/hostingHeaders.test.js` 會讀 `App.jsx` 的路由檢查，漏了測試會失敗。
- 驗證：部署後在瀏覽器 Console 執行 `fetch('/', {cache:'no-store'}).then(r => console.log(r.headers.get('cache-control')))`，應該是 `no-cache`。
- 已經被快取的舊 HTML 要等它過期（最多一小時）或關閉所有無痕視窗再開；之後的部署不會再有這個問題。

## 已知取捨與未完成

**取捨**

- 已知漏洞：`@grpc/grpc-js`（firebase 間接相依，僅 Node 端使用，瀏覽器不載入）與 functions 的 `uuid`（邊界檢查，不受影響）。待上游更新後再升級。
- 每人可建立的群組數無法只靠 rules 限制，目前不限。
- **CI 部署順序**（`.github/workflows/firebase-hosting-merge.yml`）：先部署 Hosting，再部署 functions、Firestore rules 與 Storage。2026-11-25 曾發生 Hosting 已部署成功、但 Firebase 部署動作最後的收尾步驟報 `Assertion failed: resolving hosting target of a site with no site name or target name` 而整個工作失敗，後面的 rules 與 functions 被跳過（前端已是新版、rules 還是舊的，新欄位會被拒絕）；重跑失敗的工作即恢復。若再發生：先到 Actions 重跑失敗的工作，並確認 rules 有部署；根治可在 `firebase.json` 的 `hosting` 明確寫 `"site": "catsplit-app"`，或把 rules 與 functions 的部署移到 Hosting 之前（rules 向下相容，先上較安全）。
- 個人記帳的假日資料來自第三方開源資料集 `ruyut/TaiwanCalendar`（經 jsDelivr 或 GitHub raw 取得，瀏覽器快取 30 天），不是官方 API，沒有可用性保證；失敗時只會退回「週六日是假日」。細節見[個人記帳](personal-ledger.md)。
- 個人記帳沒有後端排程：固定收支在使用者開啟帳本時才補入。
- 訪客名字不是專屬的，任何持有群組連結的人都能選用；`guestLogin` 沒有頻率限制，有人可以反覆輸入新名字塞滿群組（上限 50 人，建立者可移除）。
- LINE 使用者認領訪客名字後沒有復原機制。
- 清除瀏覽器資料後，訪客記住的名字會消失，需重新點群組連結選名字（帳目不受影響）。
- `memberExpenseCounts` 沒有回填機制，目前也沒有讀取者；`totalExpenses` 同樣沒有讀取者。
- 刪除群組（App 內的 `handleDeleteGroup` 與雲端函式的整群刪除）用單一 `writeBatch`，群組內文件超過 500 筆會失敗。
- 轉帳建議依基準幣的小數位數取整（日圓整數、美元到分），日圓這類沒有小數的貨幣，餘額帶不到 1 圓的零頭時照建議轉帳後會剩下這點殘差，不會再列成建議。
- `firebase.json` 的 `Cache-Control` 只比對 `/index.html`，`/` 與 `/group/*` 實際是 `max-age=3600`，舊版 bundle 最多會存活約 1 小時。
- 訪客與雲端函式的流程可以在本機模擬器實測，做法見下方「本機模擬器跑雲端函式」；但仍要在正式環境用真實 LINE 帳號驗證一次。

**尚未完成**

- 公開上架：綁定正式網域、Search Console、LINE Developers 後台改為公開、可被搜尋的介紹頁與 meta 標籤、LINE 官方帳號入口。
- 小額捐款：選第三方管道（不自建金流），App 內與介紹頁放入口。
- App Check：程式已就緒（設 `VITE_APPCHECK_SITE_KEY` 才啟用）。啟用後先只看 metrics 一到兩週，確認正常流量都帶 token 再對 Firestore / Storage enforce。**不要一開始就 enforce**。
- 前端錯誤監控（Sentry 等）；接入後隱私權政策要補一句。
- Storage 備份：規模擴大後評估物件版本控制。
- 清除舊支出文件上不再使用的 `receiptUrl` 欄位。
- 想做的功能：一鍵開啟收款連結（收款連結要放 `groups/{id}/payInfo/{uid}`，不可放 `memberProfiles`）、逐項分帳、離線模式、經常性支出、多語言、收據 OCR。
