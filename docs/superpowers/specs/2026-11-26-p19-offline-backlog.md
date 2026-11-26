# P19 離線使用

日期：2026-11-26　狀態：backlog（尚未動工；動工前先確認範圍並寫實作計畫放 `plans/`）

目標：沒有網路時，個人記帳仍能打開並記帳，連線後自動同步。**不需要換資料庫或改資料結構**，Firestore 本身支援離線；主要工作在「網頁外殼能離線載入」與「少數只能連線的功能的處理」。

## 現況（2026-11-26）

- `src/config/firebase.js` 用 `getFirestore(app)`，預設是**記憶體快取**：離線時重新整理就沒有資料。
- `public/sw.js` 是刻意做成的最小版（只為了可安裝，不快取任何東西）：沒網路時連 HTML 與 JS 都載不下來。
- `firebase.json` 已讓所有 SPA 路由的 HTML 設 `no-cache`（見 `docs/guides/operations.md` 的「快取標頭」），`UpdateBanner` 負責偵測新版；離線快取要和這兩者一起設計。
- 專案裡的 `runTransaction` 只有兩處：`src/features/ledger/recurringRun.js`（固定收支補入）、`src/utils/groupAggregates.js`（群組彙總）。離線時交易會失敗。

## 對現有資料設計有利的地方

- 餘額用 `increment` 在同一個 batch 更新：增量可交換，離線排隊的多筆記帳連線後各自加上去，結果正確。
- 固定 id（群組同步 `g_{群組}_e|i_{項目}`、固定收支 `r_{規則}_{日期}`）：同一筆重送不會重複，適合離線重試。
- 記帳的新增、編輯、刪除都是 `writeBatch`，離線可用。
- 個人記帳只有本人寫入，幾乎沒有多人衝突；分帳群組是多人編輯，離線期間被別人改過再送出會是「後寫者贏」，所以個人記帳先做。

## 各功能離線時的預期行為

| 功能 | 離線行為 |
|---|---|
| 記帳新增、編輯、刪除 | 可用；先存本機，連線後自動送出 |
| 固定收支補入（`recurringRun.js`，用交易） | 略過，連線後再補（本來就是「開啟帳本時才補」）；要加離線判斷避免出現錯誤 |
| 群組彙總（`groupAggregates.js`，用交易） | 待評估實際用途與頻率 |
| 群組同步到帳本 | 需連線（要讀群組資料）；顯示「需要網路」 |
| 匯出 CSV、備份、還原、刪除帳本（雲端函式） | 需連線；明確提示，不要一直轉圈 |
| 匯率抓取 | 用上次的匯率或手動輸入 |
| 國定假日 | 用本機快取，沒有就退回週末（已實作） |
| 登入 | 已登入的狀態離線維持；第一次登入或登入過期需網路（LINE 換 token 要連線） |
| 分帳群組（多人） | 第三階段再評估 |

## 要先決定的事

- **寫入的 `await` 行為**：離線時 Firestore 的寫入 Promise 要等到連線才完成，現在多處是 `await` 寫入再關閉面板、失敗才提示，離線會卡住。建議改成樂觀更新：寫入送出就更新畫面，並用 `snapshot.metadata.hasPendingWrites` 顯示「尚未同步」。
- **寫入被 rules 拒絕時**：離線寫入是連線後才驗證，被拒絕時使用者當下看不到錯誤，要有失敗提示（寫入的 Promise 或同步狀態）。
- **多分頁**：使用 `persistentMultipleTabManager`。
- **隱私與共用裝置**：本機快取會留下帳目資料；登出時要清除（`clearIndexedDbPersistence`，需在沒有進行中的連線時呼叫）；**隱私權政策**要補一句「資料會暫存在裝置上以供離線使用」。
- **儲存空間**：IndexedDB 配額與瀏覽器清除行為（iOS Safari 長時間不用可能被清）要說明。

## 分階段

1. **個人記帳離線（資料層）**
   - `initializeFirestore` 改用 `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`。
   - 離線偵測（`navigator.onLine` ＋ snapshot 的 `fromCache`／`hasPendingWrites`）與狀態顯示。
   - 固定收支補入加離線判斷；只能連線的功能加提示；寫入的 `await` 改樂觀更新與失敗提示。
   - 登出時清除本機快取；更新隱私權政策。
2. **App 外殼離線（Service Worker）**
   - 快取 HTML、JS、CSS、圖片（Workbox 或自行撰寫），這是主要工作量與風險（舊版卡住、快取難清）。
   - 與 `firebase.json` 的 `no-cache` 標頭、`UpdateBanner` 的版本檢查整合：新版部署後提示更新，Service Worker 要能取代舊版。
   - 離線時打開的行為：導向預設頁、需要登入但離線的處理。
3. **分帳群組離線與衝突處理**（視需求）。

## 驗證

- Playwright 用 `context.setOffline(true)` 模擬：離線記帳、重新整理仍有資料、連線後同步、餘額正確。
- Rules 被拒絕的離線寫入要有測試或手動案例。
- 兩台裝置交錯離線與連線的實測。

## 與其他項目的關係

- [P20 App 化](2026-11-26-p20-app-packaging-backlog.md)：上架 Google Play 不要求離線，但有離線外殼體驗更完整，兩者可獨立進行。
