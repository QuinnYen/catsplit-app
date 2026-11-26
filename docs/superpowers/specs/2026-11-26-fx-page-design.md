# 匯率頁與旅程記帳（設計草稿）

日期：2026-11-26　狀態：**草稿，待使用者確認後才動工**
前置：P14 獨立帳號、P12 個人記帳已上線。取代 [`2026-11-14-fx-page-and-misc-backlog.md`](2026-11-14-fx-page-and-misc-backlog.md) 的匯率頁部分（該檔其餘小功能維持 backlog）。
參考：使用者提供的三張 App 截圖（多列換算計算機、計算機設定、旅程明細）。

## 1. 目標

做一個**旅遊用的匯率計算機**，並能在計算機上直接把這筆花費記進「旅程」。
旅程的帳目就是個人記帳的一般帳目（同一套 `transactions`、帳戶、類別、餘額、備份、CSV），只是歸在某一趟旅程底下，**不出現在月曆主頁與個人統計**，由匯率頁自己的旅程頁顯示。

### 已決定
| 項目 | 決定 |
|---|---|
| 記帳方式 | 在匯率頁直接彈出現有的記帳面板（`LedgerEntrySheet`），不跳轉頁面 |
| 旅程是什麼 | 帳本底下的 `trips` 集合；帳目加選填欄位 `tripId`。**不是**帳戶、**不是**獨立帳本 |
| 付款方式 | 仍是 `accountId`（熊本熊卡、Cube 卡、現金…都是一般帳戶） |
| 月曆與統計 | 有 `tripId` 的帳目**不出現**在月曆主頁、圖表、預算 |
| 帳戶餘額 | **照常扣**（錢確實從那張卡花出去），含刷卡手續費的 `accountAmount` |
| 群組同步連動 | **第一版不做**，旅程穩定後再加 |

### 第一版不做
- 歷史匯率圖表、更多幣別（沿用現有 29 種）。
- 旅程帳目計入個人統計的開關（見「待確認」）。
- 群組同步歸到旅程。
- 播放開場動畫、「整理幣別」按鈕、顯示幣別名稱。

## 2. 資料模型

### 2.1 旅程 `users/{uid}/ledgers/{ledgerId}/trips/{tripId}`
| 欄位 | 型別 | 說明 |
|---|---|---|
| `name` | string 1–20 | 旅程名稱（「2026 大分溫泉」） |
| `currency` | string（3 碼） | 旅遊幣別（JPY），計算機預設以它為輸入列 |
| `startDate`、`endDate` | `'YYYY-MM-DD'`，選填 | 只做顯示與排序 |
| `archived` | bool，選填 | 結束的旅程收起來 |
| `createdAt` | timestamp | 建立後不可改 |

### 2.2 帳目新增選填欄位
`tripId`：string 1–100，指向 `trips/{tripId}`。沒有這個欄位就是一般帳目，**既有資料不用遷移**。
- 轉帳、收入、支出都可以有（收入用於退稅）。
- 群組同步與固定收支產生的帳目不會有 `tripId`。

### 2.3 路徑
`paths.js` 新增 `tripsPath(uid, ledgerId)`。

### 2.4 Firestore rules（與前端同一個 PR）
修改前（`firestore.rules`）：
```
function validTransaction(d) {
  return d.keys().hasOnly(['type', 'accountId', ..., 'date', 'source', 'createdAt'])
```
修改後：`hasOnly` 清單加入 `'tripId'`，並加
```
&& (!('tripId' in d) || (d.tripId is string && d.tripId.size() >= 1 && d.tripId.size() <= 100))
```
新增 `validTrip(d)` 與 `match /trips/{tripId}`：本人可讀；`create`／`update` 要通過 `validTrip` 且 `createdAt` 不變；`delete` 本人可刪。rules 無法檢查 `tripId` 指向的旅程存在，由前端保證。
測試：`firestore-tests/ledger.rules.mjs` 補旅程與 `tripId` 的通過與拒絕案例，`npm run test:rules`。

### 2.5 查詢與索引
- 旅程頁：`where('tripId', '==', id)`，單欄位等值查詢，**不需要複合索引**，前端自己依日期排序。
- Firestore 無法查「沒有 `tripId`」的文件，所以個人統計的排除在前端過濾（見 3.1）。

## 3. 對既有功能的影響

### 3.1 月曆與統計排除（單一過濾點）
月曆、圖表（月、年、趨勢）、預算全都從 `hooks.js` 的三個 hook 取帳目：`useMonthTransactions`、`useYearTransactions`、`useMonthsOnce`。**在這三個 hook 回傳前過濾掉 `tripId`，下游全部自動排除**，不用逐頁改。

修改前（`useMonthTransactions` 內）：
```js
const list = snap.docs.map(withId).sort(...)
```
修改後：
```js
const list = snap.docs.map(withId).filter((tx) => !tx.tripId).sort(...)
```
`useYearTransactions`、`useMonthsOnce` 同樣加 `.filter((tx) => !tx.tripId)`。讀取量不變（本來就整月讀進來）。純函式的判斷放在 `summary.js`：`isPersonalTx = (tx) => !tx.tripId`（有單元測試）。

### 3.2 帳戶餘額與淨資產
不改。旅程帳目有 `accountId` 與 `accountAmount`，`balance.js` 照常計算；「重新計算餘額」讀全部帳目，自然包含旅程帳目。

### 3.3 備份與還原（`backup.js`、`backupData.js`）
- `TX_FIELDS` 加 `tripId`；備份新增 `trips` 陣列；`BACKUP_VERSION` 維持 1（`trips` 缺少時視為空，舊備份仍可還原）。
- `parseBackup` 驗證：`tripId` 必須對得到 `trips` 裡的 id；旅程 id 不重複。
- `planRestore`／`restoreBackup`：旅程在帳目之前寫入。

### 3.4 CSV 匯出（`csvExport.js`）
多一欄「旅程」（旅程名稱，沒有則空白）；整個帳本全部帳目照舊都匯出。

### 3.5 刪除帳本與合併帳號
`deleteLedger` 用 `recursiveDelete`、`movePersonalData` 遞迴搬移，`trips` 子集合自動包含，**後端不用改**。旅程 id 是自動 id，合併時不衝突。

### 3.6 刪除旅程
行為待確認（見第 8 節）。預設方案：確認視窗顯示「這趟旅程有 N 筆帳目」，選擇「連同帳目一起刪除」（餘額退回）或「只刪旅程，帳目移回一般帳目」。

## 4. 程式結構

### 4.1 殼層抽出
`/fx` 在 `LedgerShell` 之外，但記帳面板需要 `LedgerContext`。把 `LedgerShell` 裡「載入帳本、帳戶、類別，提供 Context 與記帳面板」抽成可重用的 Provider：

| 檔案 | 動作 | 說明 |
|---|---|---|
| `src/features/ledger/LedgerProvider.jsx` | **新增** | 從 `LedgerShell` 抽出：帳本、帳戶、類別、`openEntry`、記帳面板、提示。參數 `lite`：為 true 時不跑群組同步與固定收支補入 |
| `src/features/ledger/LedgerShell.jsx` | 修改 | 改成 `<LedgerProvider>`＋原本的 Routes 與 `LedgerTabBar`，行為不變 |
| `src/features/ledger/LedgerContext.jsx` | 不改 | |

旅程屬於「目前帳本」（沿用本機的 `useActiveLedger`），所以匯率頁與個人記帳看到的是同一個帳本。

### 4.2 新增 `src/features/fx/`（依 `src/features/*` 功能模組分界）
| 檔案 | 內容 |
|---|---|
| `FxShell.jsx` | `/fx/*` 殼層：已登入非訪客時包 `LedgerProvider lite`；路由；底部列 `FeatureTabBar` |
| `FxCalculatorPage.jsx` | 計算機主頁（截圖 1）：頁首旅程名稱（點開切換旅程）、多列換算、常用修飾 chips、鍵盤、收據鍵 |
| `fxMath.js` | 純函式：多列換算、修飾（刷卡 +%、免稅 −%）、小數位數取整（有單元測試） |
| `fxPrefs.js` | 本機偏好（`localStorage`，讀寫要 try/catch）：換算列的幣別與順序、預設金額、小數位數、顯示符號、鍵盤震動 |
| `FxSettingsPage.jsx` | 設定頁（截圖 2）：小數位數、預設金額、顯示幣別符號、鍵盤震動、外觀沿用全站主題、自訂匯率 |
| `TripDetailPage.jsx` | 旅程明細（截圖 3）：總花費卡、依日期分組列表、「＋記帳」 |
| `tripSummary.js` | 純函式：總花費（統計幣別與旅遊幣別）、依日分組與每日小計（有單元測試） |
| `TripSheet.jsx` | 新增、編輯、刪除旅程的底部面板 |
| `hooks.js` | `useTrips(uid, ledgerId)`、`useTripTransactions(uid, ledgerId, tripId)` |
| `data.js` | `createTrip`、`updateTrip`、`deleteTrip`（寫入走資料層，畫面不直接組路徑） |

### 4.3 修改既有檔案
| 檔案 | 修改 |
|---|---|
| `src/App.jsx:174` | `/fx` 的 `ComingSoonPage` → `/fx/*` 的 `FxShell`（lazy） |
| `src/features/ledger/paths.js` | 新增 `tripsPath` |
| `src/features/ledger/hooks.js` | 三個帳目 hook 過濾 `tripId`（3.1） |
| `src/features/ledger/summary.js` | 新增 `isPersonalTx` |
| `src/features/ledger/entryDraft.js` | draft 帶 `tripId`、輸出到帳目、`draftFromTransaction` 保留 `tripId` |
| `src/features/ledger/LedgerEntrySheet.jsx` | 接受預填（`preset`），見第 5 節 |
| `src/features/ledger/backup.js`、`backupData.js`、`csvExport.js` | 見 3.3、3.4 |
| `firestore.rules`、`firestore-tests/ledger.rules.mjs` | 見 2.4 |
| `src/i18n/zh-TW.js`、`en.js` | 新增文字（兩種語言都要有）；`comingSoon.fx` 移除 |
| `src/pages/ComingSoonPage.jsx` | `/fx` 不再使用後，若沒有其他用途則移除 |

`entryDraft.js` 修改示意（輸出帳目）：
```js
// 修改前
data: { type: kind, accountId: account.id, currency, ...amounts, category, ..., date: draft.date, source },
// 修改後（tripId 沒有值時不放進文件，undefined 會被 Firestore 拒絕）
data: { type: kind, accountId: account.id, currency, ...amounts, category, ..., date: draft.date, source, ...(draft.tripId && { tripId: draft.tripId }) },
```

## 5. 記帳流程（匯率頁的重點）

1. 使用者在計算機輸入金額（算式沿用 `expression.js`，不用 `eval`），目前聚焦的那一列是「輸入幣別」。
2. 按收據鍵：`openEntry({ preset })` 彈出記帳面板，預填：
   - `amount`：輸入列的金額（算式先算出結果）。
   - `currency`：聚焦列的幣別。
   - `baseRate`：計算機目前使用的匯率（若使用者設了自訂匯率就用它）。
   - `tripId`：頁首選的旅程；沒選旅程時不能記（收據鍵提示先選或建立旅程）。
   - `sourceType: 'fx'`、`date` 今天、`kind` 支出。
3. 使用者只需補：類別、付款帳戶、備註，按儲存。
4. 儲存後面板關閉，計算機清空（保留旅程與換算列），旅程頁立即多一筆（即時訂閱）。「再記一筆」沿用面板現有行為。
5. 面板是**預填模式**：既有的 `?amount=&currency=&rate=&source=fx` 網址參數仍保留給其他入口使用。

**刷卡 +1.5%**：這是計算機上的修飾 chip，同時帶入面板的「預估扣款金額」：當所選帳戶幣別與帳目幣別不同時，`accountAmount` 預設 = 預估值 × (1 + 手續費)，使用者可手動改成實際扣款（現有行為）。
**免稅 −10%**：只作用於計算機輸入金額（換算與記帳的金額都是扣掉後的結果），不另存欄位。
> 這兩個修飾的套用位置是我依截圖的推測，見「待確認」。

**編輯與刪除**：旅程頁點一筆帳目，開同一個面板編輯（沿用 `draftFromTransaction`，保留 `tripId`）；刪除會退回餘額（現有行為）。

## 6. 畫面與主題

- 全部使用專案 `--cs-*` 主題變數，支援暗黑模式，並通過 `npm run check:colors`。截圖的紅色強調色用 `--cs-rc-stamp`／`--cs-rc-stamp-text`，不另外寫死顏色。
- 計算機鍵盤：沿用 `expression.js` 的規則；是否沿用 `NumberPad.jsx` 的版面（截圖多了「00」與收據鍵）實作前先確認，不合用就在 `fx/` 新做 `FxKeypad.jsx`。
- 旅程頁沒有月曆，風格比照截圖 3：總花費卡＋依日分組列表；底部列用 `FeatureTabBar`，中間凸起鈕是「記帳」。
- **訪客**：沒有個人記帳。計算機仍可使用（純換算）；收據鍵與旅程入口灰色並提示，同記帳與目標的做法；訪客不掛 `LedgerProvider`。
- 一個旅程的總花費：
  - 統計幣別總額 = 旅程內支出 `baseAmount` 加總（收入如退稅先不扣，見待確認）。
  - 旅遊幣別總額 = 幣別等於旅程幣別的帳目 `amount` 加總。
  - 每日小計 = 當日支出 `baseAmount` 加總。

## 7. 實作順序（每階段都跑 `npm run lint`、`npm test`、`npm run build`）

1. **資料與規則**：`tripsPath`、rules、`tripId` 欄位、`entryDraft`、三個 hook 的過濾、`isPersonalTx`、備份與 CSV。含 rules 測試與兩個帳號實測（見 `docs/guides/operations.md`）。此階段沒有新畫面，但個人記帳完全不受影響。
2. **Provider 抽出**：`LedgerProvider`、`LedgerShell` 改寫，確認個人記帳行為不變。
3. **旅程頁**：`FxShell`、`useTrips`、`TripSheet`、`TripDetailPage`、`tripSummary`。此時可用記帳面板手動記到旅程。
4. **計算機頁**：`fxMath`、`FxCalculatorPage`、鍵盤、收據鍵預填。
5. **設定頁與收尾**：`FxSettingsPage`、`fxPrefs`、自訂匯率、i18n、文件。

規定：rules 與前端放同一個 PR（CI 推 `main` 就部署）。

## 8. 待確認

1. **旅程帳目要不要計入個人統計的開關？** 目前決定「完全不出現」。若之後要，需要讓三個 hook 讀得到旅程設定。
2. **刪除旅程**：連同帳目刪除（退餘額）／帳目移回一般帳目／兩者讓使用者選（草稿預設）。
3. **刷卡 +1.5%、免稅 −10%** 的套用位置（見第 5 節）是推測，你確認或指正。
4. **退稅等收入**：旅程總花費是否扣除旅程內的收入？
5. **計算機的換算列**：只存在本機偏好，還是跟著旅程存到 Firestore（換裝置不用重設）？草稿預設只存本機。
6. 鍵盤版面是否沿用現有 `NumberPad`。

## 9. 完成後要更新的文件
`README.md` 功能清單、`docs/guides/currency.md`、`docs/guides/personal-ledger.md`（結構、帳目欄位、備份、CSV、移除「尚未做」裡的匯率頁入口）、`docs/guides/data-model.md`、`docs/guides/architecture.md`；本 spec 與 backlog 的匯率頁部分搬到 `archive/`，更新 [`README.md`](README.md) 索引。
