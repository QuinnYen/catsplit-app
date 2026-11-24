# P12 個人記帳：實作計畫

日期：2026-11-24　對應設計：[`../specs/2026-11-14-p12-personal-ledger-design.md`](../specs/2026-11-14-p12-personal-ledger-design.md)　狀態：待開始

## 0. 目標與原則

做出 `/ledger`（底部導覽列「記帳」，取代 P18 的佔位頁），支援手動記收支、月報表與統計，以及連結群組後自動同步「我的分攤」。

每個 PR 合併到 `main` 就會立刻部署（hosting、functions、rules），所以：
- **每一步都要向下相容**，rules 與前端放在同一個 PR；沒有 UI 使用的新 rules 可以先單獨上線。
- 每個 PR 都要跑 `npm run lint`、`npm test`、`npm run build`；涉及 rules 的加跑 `npm run test:rules`，並用兩個帳號實測（見 `docs/guides/operations.md`）。
- 同步邏輯一律寫成**純函式**加單元測試，畫面只負責呼叫。

## 1. 讀碼後的現況（會影響實作的事實）

1. **群組 `incomes` 有 `splits`**（`AddExpensePage.jsx` 寫入 `received` 與 `splits`），收入同步可直接用 `splits[uid]`。spec 的待確認項目已解決。
2. **`movePersonalData` 是遞迴搬移整棵 `users/{uid}`**（`functions/memberOps.js`），`transactions` 在帳號合併時會自動搬；但固定 id 的 `settings/ledgerLinks` 衝突時預設保留 `keepUid` 那份，spec 要的是「群組取聯集、同群組取較早的 `linkedAt`」，需要另外處理。
3. **`deleteMyData` 在前端用 `writeBatch` 刪各集合**（`src/utils/deleteMyData.js`），一個 batch 上限 500 筆。個人帳目沒有數量上限，必須分批刪，不能照抄 `deleteMySpendMethods` 的寫法。
4. **`ExpenseForm.jsx` 有 621 行、綁定群組**（成員、付款人、分帳方式）。spec 寫「抽出通用表單」風險高，改為**另寫簡單的 `LedgerForm`**，只重用小元件（`CurrencySelect`、`CalculatorModal`、`DateTimeField`、`useExchangeRate`、`spendMethods`）。群組表單完全不動。
5. **`StatsPage.jsx`（285 行）也綁定群組**。個人統計同樣另寫，把可共用的純計算（依分類加總、依付款方式加總）放在 `src/features/ledger/`，不改動群組端。
6. **月份工具現成**：`src/utils/monthRange.js`（`monthRange`、`shiftMonth`、`toMonthKey`），個人帳目 `date` 是 `YYYY-MM-DD` 字串，用字串範圍查詢，只需單欄位索引，**不需要新的複合索引**。
7. **Firestore 目前沒開本地快取**（`src/config/firebase.js`），本計畫不依賴它；快取另案處理。
8. **rules 的成員判斷已是 `isMember()`**，儲蓄目標的 rules 可當範本（`firestore.rules`、`firestore-tests/savings.rules.mjs`）。
9. **P18 的底部導覽列已上線**：`/ledger` 目前由 `ComingSoonPage` 佔位，訪客在導覽列上已是灰色。

## 2. 實作順序

### PR1：rules 與資料層（沒有 UI，可獨立上線）

- `firestore.rules`：新增 `users/{uid}/transactions/{id}` 與 `users/{uid}/settings/ledgerLinks`，僅本人、非訪客；驗證 `type`、`currency`、`amount`、`baseAmount`（>0 且 <1e12）、`date` 為字串、備註 ≤ 50 字、`source.type` 在允許清單內。
- `firestore-tests/ledger.rules.mjs`：本人可寫、他人不可讀寫、訪客拒絕、欄位驗證、`ledgerLinks` 同樣檢查。
- `src/features/ledger/`：月份加總、依分類加總、依付款方式加總等純函式與測試；主要幣別換算（沿用 `applyExchangeRate` 思路）。
- 因為沒有任何 UI 使用，合併後行為不變，風險最低。

### PR2：手動記帳 MVP

- 把 `/ledger` 換成正式頁面：月份切換（`MonthPicker`）、收入／支出／結餘合計、依日期分組的列表。
- `/ledger/new`、`/ledger/:id/edit`：`LedgerForm`（收入／支出、金額、幣別、日期、分類、付款方式、備註）；新增表單讀 `?amount=&currency=&rate=&source=fx` 預填（匯率頁預留介面）。
- 主要幣別：第一次進帳本時設定（預設 TWD），已有帳目後不可改；存 `settings/profile.mainCurrency`（確認該文件的 rules 允許新增此欄位）。
- 匯率取得失敗時可手動輸入（`useExchangeRate` 的 `setManualRate`）。
- **`deleteMyData` 涵蓋 `transactions`（分批刪除）**，並更新 `public/privacy.html` 與 `public/privacy.en.html`：帳目一開始可以寫入，就必須能被刪除。
- 帳號合併：確認 `transactions` 隨 `movePersonalData` 搬移，補單元測試；`functions/emulator-e2e/identity-flow.mjs` 若方便則加一個帳目。
- i18n：中英文字串、個人收入分類。
- 文件：新增 `docs/guides/personal-ledger.md`（第一版），更新 `README.md`、`docs/guides/data-model.md`。

### PR3：月報表與統計

- `/ledger/stats`：分類占比、付款方式支出、收支趨勢（沿用現有圖表元件，先看 `StatsPage` 用什麼）。
- 純計算已在 PR1，這一步主要是畫面。

### PR4：群組連結與自動同步

先決條件：PR1 的純函式測試通過。

- `src/features/ledger/syncPlan.js`（純函式）：輸入（群組帳目、現有帳目、`linkedAt`、`uid`、主要幣別）→ 輸出 `{ upserts, deletes, checks }`。涵蓋：依消費時間與 `linkedAt` 篩選、分攤為 0 與贊助不產生、固定 id `g_{g}_e_{id}`／`g_{g}_i_{id}`、`source.edited` 不被覆寫、匯率凍結、被刪除與日期移動的處理、`detached` 帳目重新接回。
- `useLedgerSync`：只同步正在看的月份，用 `getDocs`、記憶已同步月份、先比對再寫；無法讀取的群組自動轉為一般帳目。
- 帳本頁的「連結群組」入口：列出我加入的群組與開關；取消連結的確認（保留／一併刪除）。
- 同步帳目的唯讀顯示（來自群組標籤、鎖頭、金額日期不可改）。
- **帳號合併**：`mergeFlow`／`memberOps` 對 `settings/ledgerLinks` 做聯集（同群組取較早的 `linkedAt`），其餘路徑維持原規則；補單元測試。
- 兩個帳號實測：A、B 同在一個群組，A 記帳後 B 開帳本應看到；A 改金額、刪除後 B 重新整理應跟著變。

### PR5：收尾

- 移除 `ComingSoonPage` 的 `/ledger` 用法（`/fx` 仍在用，元件保留）。
- 更新 `docs/guides/personal-ledger.md` 為完整版、`README.md` 功能清單、`docs/superpowers/specs/README.md` 的 P12 狀態；P12 spec 與本計畫完成後搬到 `docs/superpowers/archive/`。

## 3. 風險與處理

| 風險 | 處理 |
|---|---|
| 帳目沒有數量上限，`deleteMyData` 與帳號合併可能逾時 | 刪除分批（每批 ≤ 400）；合併的 `create` 是逐筆序列執行，帳目數到數千筆時要改成批次寫入，PR2 先量測 |
| 同步讀取量隨群組與帳目增加 | 月份範圍、節流、先比對再寫（見 spec 2.5）；`updatedAt` 增量同步列為之後的優化 |
| 使用者誤以為同步是即時的 | 帳本頁提供「重新整理」，並說明其他成員記帳後需重開 |
| 在 LINE 內建瀏覽器的行為 | 每個 PR 上線後用 LINE 內開啟實測一次（含訪客） |
| 主要幣別設定後不可改，設錯很難補救 | 第一次設定時顯示確認說明，預設 TWD |

## 4. 不在本計畫範圍

預算（等 P8）、CSV 匯出、帳戶間轉帳、重複性記帳、匯率換算頁本身、首頁摘要卡片、本地快取（`persistentLocalCache`）、群組帳目增量同步。

## 5. 開工前待確認

1. `settings/profile` 的 rules 是否允許新增 `mainCurrency` 欄位（目前驗證暱稱 1～20 字，可能對其他欄位有限制）。
2. 個人收入分類的最終清單（薪資、獎金、投資、退款、其他）與圖示。
3. 統計圖表要沿用 `StatsPage` 的哪些元件。
