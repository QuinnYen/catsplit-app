# 安全與維運

上線時已做的防護，以及之後修改時要注意的地方。

## 存取控制

- **Firestore / Storage rules 是唯一的存取防線**（`firestore.rules`、`storage.rules`）。改 rules 後請用兩個帳號實測：加入、退出、建立者移除成員、改暱稱，以及訪客加入與認領。
- 群組成員名單只能減少一人（本人退出，或建立者移除他人）；新增成員只能由本人加入，或由成員新增虛擬成員，上限 50 人。
- **收據圖片受 rules 保護**：Firestore 只存 `receiptPath`（Storage 路徑），顯示時用 `getBlob()` 以登入身分下載。**不要改回 `getDownloadURL()` 並存進資料庫**，帶 token 的網址會繞過 rules，任何拿到網址的人都能看。群組封面仍使用帶 token 的網址（敏感度低）。

## Storage CORS

`getBlob()` 需要 bucket 設定 CORS，設定內容在 `storage-cors.json`，不會隨部署更新，需手動套用：

```bash
gcloud storage buckets update gs://catsplit-app.firebasestorage.app --cors-file=storage-cors.json
```

## 綁定正式網域時要一起改

漏改會導致登入或收據載入失敗。

1. `functions/index.js` 的 `ALLOWED_ORIGINS`
2. `storage-cors.json`，並重新執行上面的指令
3. LINE Developers 後台的 LIFF Endpoint URL 與 LINE Login Callback URL

## 備份與用量

- Firestore 已開啟時間點復原（PITR，保留 7 天）。**Storage 的收據圖片沒有備份**。
- Google Cloud 已設預算警示。
- Cloud Functions（`lineLogin`、`verifyLiffToken`、`guestLogin`、`claimMember`）為公開端點，已設 `maxInstances: 5`。

## 分帳計算

- 四捨五入的尾差歸最大出資者（不在分攤名單時歸第一位成員），確保各人份額總和等於總額。邏輯在 `applyExchangeRate`。
- 支出以 `payments`（誰出多少）與 `splits`（誰分攤多少）儲存，金額都換算成群組基準幣別。
- `npm test` 可跑 `expenseHelpers` 的單元測試。

## 已知取捨與未完成

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
