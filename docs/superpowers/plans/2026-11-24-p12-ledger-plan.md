# P12 個人記帳：實作計畫

日期：2026-11-24　對應設計：[`../specs/2026-11-14-p12-personal-ledger-design.md`](../specs/2026-11-14-p12-personal-ledger-design.md)　狀態：待開始

## 0. 目標與原則

做出 `/ledger/*`（底部導覽列「記帳」，取代 P18 的佔位頁）：多個帳本、帳戶與多幣別帳目、月曆主頁、圖表，以及連結分帳群組後自動同步「我的分攤」。

每個 PR 合併到 `main` 就會立刻部署（hosting、functions、rules），所以：
- **每一步都要向下相容**，rules 與前端放在同一個 PR；沒有 UI 使用的新 rules 可以先單獨上線。
- 每個 PR 都要跑 `npm run lint`、`npm test`、`npm run build`；涉及 rules 的加跑 `npm run test:rules`，並用兩個帳號實測（見 `docs/guides/operations.md`）。
- 同步、換算、餘額、匯入的邏輯一律寫成**純函式**加單元測試，畫面只負責呼叫。

## 1. 讀碼後的現況（會影響實作的事實）

1. **群組 `incomes` 與支出一樣有 `splits`**（`AddExpensePage.jsx` 寫入 `received` 與 `splits`），收入同步可直接用 `splits[uid]`。
2. **`movePersonalData` 的 `collectTree` 是遞迴列出整棵 `users/{uid}`**（`functions/memberOps.js`），帳本子樹會連同 id 一起搬，`accountId` 不會失效；但它是逐筆序列 `create`，帳目到數千筆時會慢，要在 PR2 量測。固定 id 的 `groupLinks` 衝突預設保留 `keepUid` 那份，spec 要的是取較早的 `linkedAt`，需另外處理。
3. **刪除要走後端**：`functions/index.js` 已有 `deleteGroup` 用 `recursiveDelete`，沒有 500 筆上限。帳本與「刪除我的資料」比照新增一支函式，不用前端 `writeBatch`（`src/utils/deleteMyData.js` 目前是前端分批，無法處理無上限的帳目）。
4. **`ExpenseForm.jsx` 有 621 行、綁定群組**（成員、付款人、分帳方式）。另寫簡單的 `LedgerForm`，只重用小元件（`CurrencySelect`、`CalculatorModal`、`DateTimeField`、`useExchangeRate`）。群組表單完全不動。
5. **`StatsPage.jsx`（285 行）也綁定群組**。個人統計另寫，可共用的純計算放 `src/features/ledger/`，不改動群組端。
6. **月份工具現成**：`src/utils/monthRange.js`；帳目 `date` 是 `YYYY-MM-DD` 字串，在帳本子集合內用單一欄位範圍查詢，**不需要新的複合索引**（CI 不會部署索引）。
7. **統計幣別放在帳本上**，不放 `settings/profile`，所以那份 rules 不用改。
8. **付款方式（`spendMethods`）完全不碰**，帳戶是全新的集合。
9. **Firestore 目前沒開本地快取**（`src/config/firebase.js`），本計畫不依賴它。
10. **rules 的成員判斷已是 `isMember()`**，儲蓄目標的 rules 與 `firestore-tests/savings.rules.mjs` 可當範本。
11. **P18 的底部導覽列已上線**：`/ledger` 目前由 `ComingSoonPage` 佔位，訪客在導覽列上已是灰色。

## 2. 實作順序

### PR1：rules 與資料層（沒有 UI，可獨立上線）

- `firestore.rules`：新增 `users/{uid}/ledgers/{id}` 與其下的 `accounts`、`transactions`、`groupLinks`，僅本人、非訪客；驗證 `type`、`currency`、`amount`、`baseAmount`（> 0 且 < 1e12）、名稱長度、`date` 為字串、`source.type` 在允許清單內。
- `firestore-tests/ledger.rules.mjs`：本人可寫、他人不可讀寫、訪客拒絕、欄位驗證。
- `src/features/ledger/` 純函式與測試：換算（帳戶幣別 → 統計幣別）、餘額增量（含轉帳跨幣別）、月份與當日加總、依分類加總、同步計畫（見 PR5）、匯入計畫。
- 沒有任何 UI 使用，合併後行為不變，風險最低。

### PR2：帳本骨架與記帳（支出、收入）

- 帳本專用導覽列 `LedgerTabBar`（首頁／帳本／記帳／帳戶／設定，中間凸起）；`/ledger/*` 下不顯示 `MainTabBar`，「首頁」回到 `/`。帳戶、圖表、設定先放佔位頁。
- 帳本切換與新增：header 左上圓鈕的選單；新增帳本（名稱、圖示、統計幣別，先說明建立後不可改）；第一次進入自動建立「我的帳本」（TWD）與「現金」帳戶；最近使用的帳本 id 存 `localStorage`。
- 帳本主頁：月份切換、支出／收入／結餘三欄、上半月曆（有帳目的日期標點）、下半當日明細。
- 記帳面板：支出／收入、金額、分類、帳戶、日期、備註；帳戶幣別與統計幣別不同時顯示換算與可改的匯率（`useExchangeRate`，失敗時手動輸入）；儲存並再記一筆；編輯與刪除，餘額在同一個 batch 用 `increment`。
- 讀 `?amount=&currency=&rate=&source=fx` 預填（匯率頁預留介面）。
- 刪除：新增後端函式 `deleteLedger`（`recursiveDelete`，比照 `deleteGroup`，建立者驗證 ID token）；「刪除我的資料」改由後端刪 `users/{uid}/ledgers` 子樹；更新 `public/privacy.html` 與 `public/privacy.en.html`。
- 帳號合併：確認帳本子樹隨 `movePersonalData` 搬移，補單元測試並量測大量帳目的耗時。
- i18n（中英文）、`docs/guides/personal-ledger.md` 第一版、`README.md`。

### PR3：帳戶與轉帳

- 帳戶頁：淨資產（外幣依匯率估算並標註）、帳戶清單與餘額；新增、編輯（幣別不可改）、封存帳戶；有帳目的帳戶不能刪除。
- 「重新計算餘額」修復按鈕（讀該帳戶全部帳目重算 `balance`）。
- 記帳面板加入「轉帳」，跨幣別時多一個轉入金額；當日明細顯示轉帳（轉出 → 轉入）。
- 補 rules 測試（轉帳欄位）與餘額純函式測試。

### PR4：圖表

- `/ledger/stats`：分類占比、近 6 個月支出趨勢（沿用 `StatsPage` 的色盤）；從帳本主頁右上圓鈕進入。
- 純計算已在 PR1，這一步主要是畫面。

### PR5：設定與群組連結同步

先決條件：PR1 的純函式測試通過。

- 設定頁「連結群組」：每列左邊下拉選群組、右邊開關；列表底下分隔線與靠右的「匯入到帳戶」按鈕；統計幣別（唯讀說明）。
- 打開開關：寫 `groupLinks` 與快照帳戶（id `snap_{groupId}`）；關閉：確認後刪除快照帳戶與未匯入的帳目。
- `src/features/ledger/syncPlan.js`（純函式）：輸入（群組帳目、現有快照帳目、`linkedAt`、`uid`、統計幣別）→ 輸出 `{ upserts, deletes }` 與快照帳戶的筆數與淨額。涵蓋：依消費時間篩選、分攤為 0 與贊助不產生、固定 id `g_{g}_e_{id}`／`g_{g}_i_{id}`、`source.edited` 不被覆寫、匯率凍結、來源刪除或日期移到連結前的處理、已匯入（`detached`）的不被碰。
- `useLedgerSync`：開啟帳本時同步連結後的全部，用 `getDocs`、同一次使用只同步一次、先比對再寫；無法讀取的群組提示一次。
- 匯入到帳戶：選目標帳戶、預覽、跨幣別時確認匯率；原幣相同時用原幣按分攤比例計算；分批寫入（每批 ≤ 400）並以 `increment` 更新 `balance`；完成後詢問是否停止同步。
- 同步帳目的唯讀顯示（來自群組標籤、金額日期不可改）。
- **帳號合併**：`groupLinks` 兩邊都有同一群組時取較早的 `linkedAt`，補單元測試。
- 兩個帳號實測：A、B 同在一個群組，A 記帳後 B 開帳本應看到；A 改金額、刪除後 B 重新整理應跟著變；匯入後再同步不會把帳目拉回快照。

### PR6：收尾

- 移除 `ComingSoonPage` 的 `/ledger` 用法（`/fx` 仍在用，元件保留）。
- 更新 `docs/guides/personal-ledger.md` 為完整版、`docs/guides/data-model.md`、`README.md`、`docs/superpowers/specs/README.md`；P12 spec 與本計畫完成後搬到 `docs/superpowers/archive/`。

## 3. 風險與處理

| 風險 | 處理 |
|---|---|
| 帳目沒有數量上限，帳號合併可能逾時 | 刪除走後端 `recursiveDelete`；合併的 `create` 是逐筆序列執行，PR2 先量測，數千筆時改批次寫入 |
| 餘額用 `increment` 維護會漂移 | 同步不碰餘額；提供重新計算按鈕；純函式加測試 |
| 匯入分批寫入中途失敗 | 固定 id 就地更新，重新匯入可補完；`balance` 增量先算好再寫，匯入後可執行重新計算 |
| 使用者誤以為同步是即時的 | 帳本提供「重新整理」，並說明其他成員記帳後需重開 |
| 在 LINE 內建瀏覽器的行為 | 每個 PR 上線後用 LINE 內開啟實測一次（含訪客） |
| 統計幣別與帳戶幣別建立後不可改 | 建立前顯示確認說明 |
| 新增後端函式會觸發 CI 部署 functions | 函式與前端放同一個 PR，沿用 `deleteGroup` 的驗證寫法；新增函式不需要 `--force` |

## 4. 不在本計畫範圍

預算（等 P8）、CSV 匯出、重複性記帳、匯率換算頁本身、首頁摘要卡片、本地快取（`persistentLocalCache`）、跨帳本總覽與帳目在帳本間移動、帳戶內混幣別（原幣欄位）。

## 5. 開工前待確認

1. 個人收入分類的最終清單（薪資、獎金、投資、退款、其他）與圖示。
2. 統計圖表要沿用 `StatsPage` 的哪些元件。
3. 新增帳本的圖示選擇器：沿用群組的 `GroupIconPicker`，還是先只用顏色。
