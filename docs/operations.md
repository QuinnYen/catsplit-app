# 安全與維運

上線時已做的防護，以及之後修改時要注意的地方。

## 存取控制

- **Firestore / Storage rules 是唯一的存取防線**（`firestore.rules`、`storage.rules`）。改 rules 後請用兩個帳號實測：加入、退出、建立者移除成員、改暱稱，以及訪客加入與認領。
- 群組成員名單只能減少一人（本人退出，或建立者移除他人）；新增成員只能由本人加入，或由成員新增虛擬成員，上限 50 人。
- **收款方式**（`users/{uid}/paymentMethods`）：本人可讀寫；其他登入者只能讀 `isPublic == true` 的，列表查詢必須帶 `where('isPublic', '==', true)`。訪客不能寫。可見範圍的取捨見[收款方式](payment-methods.md)。
- **收據圖片受 rules 保護**：Firestore 只存 `receiptPath`（Storage 路徑），顯示時用 `getBlob()` 以登入身分下載。**不要改回 `getDownloadURL()` 並存進資料庫**，帶 token 的網址會繞過 rules，任何拿到網址的人都能看。群組封面仍使用帶 token 的網址（敏感度低）。

## Storage CORS

`getBlob()` 需要 bucket 設定 CORS，設定內容在 `storage-cors.json`，不會隨部署更新，需手動套用：

```bash
gcloud storage buckets update gs://catsplit-app.firebasestorage.app --cors-file=storage-cors.json
```

## 匯出 CSV（`exportCsv`）

LINE 內建瀏覽器無法下載 blob，所以在 LINE 裡匯出時：前端把 CSV 傳給 `exportCsv`，函式驗證登入與群組成員身分後存到 Storage 的 `exports/`，回傳 **5 分鐘有效的簽名網址**，再用 `liff.openWindow({ external: true })` 開外部瀏覽器下載。一般瀏覽器仍直接下載，不經過函式。

首次部署前要手動設定兩件事（不會隨部署更新）：

1. **簽名權限**：函式用執行時的服務帳號簽網址，該帳號需要「Service Account Token Creator」，並啟用 IAM Service Account Credentials API。

   ```bash
   gcloud services enable iamcredentials.googleapis.com --project=catsplit-app
   SA=$(gcloud projects describe catsplit-app --format='value(projectNumber)')-compute@developer.gserviceaccount.com
   gcloud iam service-accounts add-iam-policy-binding $SA      --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator --project=catsplit-app
   ```

2. **自動清除**：`exports/` 底下的檔案 1 天後刪除（設定在 `storage-lifecycle.json`）。這個指令會**取代整個 bucket 的生命週期設定**，目前沒有其他規則。

   ```bash
   gcloud storage buckets update gs://catsplit-app.firebasestorage.app --lifecycle-file=storage-lifecycle.json
   ```

`storage.rules` 沒有 `exports/` 的規則，所以前端無法直接讀寫，只有函式（Admin SDK）能存取。

## 綁定正式網域時要一起改

漏改會導致登入或收據載入失敗。

1. `functions/index.js` 的 `ALLOWED_ORIGINS`
2. `storage-cors.json`，並重新執行上面的指令
3. LINE Developers 後台的 LIFF Endpoint URL 與 LINE Login Callback URL

## 備份與用量

- Firestore 已開啟時間點復原（PITR，保留 7 天）。**Storage 的收據圖片沒有備份**。
- Google Cloud 已設預算警示。
- Cloud Functions（`lineLogin`、`verifyLiffToken`、`guestLogin`、`claimMember`、`detachMember`、`exportCsv`、`sharePage`）為公開端點，已設 `maxInstances: 5`。

## 分帳計算

- 四捨五入的尾差歸最大出資者（不在分攤名單時歸第一位成員），確保各人份額總和等於總額。邏輯在 `applyExchangeRate`。
- 支出以 `payments`（誰出多少）與 `splits`（誰分攤多少）儲存，金額都換算成群組基準幣別。
- 群組彙總欄位（`totalAmount`、`totalExpenses`、`memberBalances`、`memberExpenseCounts`）：新增支出與轉帳用 `increment()`；編輯、刪除支出與刪除轉帳都透過 `src/utils/groupAggregates.js` 的 `recomputeGroupAggregates` 讀取全部子集合後重算並寫回（計算在 `computeGroupAggregates`）。重算使用 `runTransaction`：先讀群組文件，再讀子集合，最後寫回；`getDocs` 不在交易的讀取集合內，正確性只靠群組文件的版本。前提是所有影響彙總的寫入，不是在 batch 裡同時寫群組文件（新增支出、新增轉帳），就是寫入後重算（編輯、刪除）。例外：雲端函式 `migrateMember` 不是交易，可能蓋掉同時發生的寫入（既有問題，尚未處理）。
- 收入存在 `groups/{id}/incomes`，是反向的支出：`balance += splits − received`（分得者加、收款者減），與支出、轉帳一起算進 `memberBalances`。換算成基準幣別時，尾差歸最大收款者（重用 `applyExchangeRate`，把 `received` 當 `payments`）。
- 收入另有群組彙總欄位 `totalIncome`（各筆 `amount` 加總）與 `incomeCount`；`totalAmount` 仍是純支出。新增收入用 `increment()`（與新增支出一樣，必須和群組文件在同一個 batch）；編輯、刪除收入走 `recomputeGroupAggregates`。只有讀過 `incomes` 的重算才會寫這兩個欄位（沒有收入時寫 0），舊群組沒有這兩個欄位時讀取一律當 0。
- 上面「所有影響彙總的寫入」的前提同樣適用於收入；`migrateMember` 例外同樣適用（也會轉移 `incomes` 裡的 uid，但不是交易）。
- `npm test` 可跑 `expenseHelpers` 的單元測試。

## 已知取捨與未完成

**取捨**

- 已知漏洞：`@grpc/grpc-js`（firebase 間接相依，僅 Node 端使用，瀏覽器不載入）與 functions 的 `uuid`（邊界檢查，不受影響）。待上游更新後再升級。
- 每人可建立的群組數無法只靠 rules 限制，目前不限。
- 訪客名字不是專屬的，任何持有群組連結的人都能選用；`guestLogin` 沒有頻率限制，有人可以反覆輸入新名字塞滿群組（上限 50 人，建立者可移除）。
- LINE 使用者認領訪客名字後沒有復原機制。
- 清除瀏覽器資料後，訪客記住的名字會消失，需重新點群組連結選名字（帳目不受影響）。
- `memberExpenseCounts` 沒有回填機制，目前也沒有讀取者；`totalExpenses` 同樣沒有讀取者。

**尚未完成**

- 公開上架：綁定正式網域、Search Console、LINE Developers 後台改為公開、可被搜尋的介紹頁與 meta 標籤、LINE 官方帳號入口。
- 小額捐款：選第三方管道（不自建金流），App 內與介紹頁放入口。
- App Check：程式已就緒（設 `VITE_APPCHECK_SITE_KEY` 才啟用）。啟用後先只看 metrics 一到兩週，確認正常流量都帶 token 再對 Firestore / Storage enforce。**不要一開始就 enforce**。
- 前端錯誤監控（Sentry 等）；接入後隱私權政策要補一句。
- Storage 備份：規模擴大後評估物件版本控制。
- 清除舊支出文件上不再使用的 `receiptUrl` 欄位。
- 想做的功能：一鍵開啟收款連結（收款連結要放 `groups/{id}/payInfo/{uid}`，不可放 `memberProfiles`）、逐項分帳、離線模式、經常性支出、多語言、收據 OCR。
