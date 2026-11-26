# 匯率頁與旅程記帳（設計草稿）

日期：2026-11-26　狀態：**已確認，可動工**（第一～五階段先做，垃圾桶為最後的第六階段）
前置：P14 獨立帳號、P12 個人記帳已上線。取代 [`2026-11-14-fx-page-and-misc-backlog.md`](2026-11-14-fx-page-and-misc-backlog.md) 的匯率頁部分（該檔其餘小功能維持 backlog）。
參考：使用者提供的四張 App 截圖（多列換算計算機、計算機設定、旅程明細、實付計算）。

## 1. 目標

做一個**旅遊用的匯率計算機**，並能在計算機上直接把這筆花費記進「旅程」。
旅程的帳目就是個人記帳的一般帳目（同一套 `transactions`、帳戶、類別、餘額、備份、CSV），只是歸在某一趟旅程底下，**不出現在月曆主頁與個人統計**，由匯率頁自己的旅程頁顯示。

### 已決定
| 項目 | 決定 |
|---|---|
| 記帳方式 | 在匯率頁直接彈出現有的記帳面板（`LedgerEntrySheet`），不跳轉頁面 |
| 旅程是什麼 | 帳本底下的 `trips` 集合；帳目加選填欄位 `tripId`。**不是**帳戶、**不是**獨立帳本 |
| 付款方式 | 仍是 `accountId`（熊本熊卡、Cube 卡、現金…都是一般帳戶） |
| 月曆與統計 | 預設**不出現**在月曆主頁、圖表、預算；每趟旅程有「計入個人統計」開關（預設關），打開後才出現並計入 |
| 帳戶餘額 | **照常扣**（錢確實從那張卡花出去），含刷卡手續費的 `accountAmount` |
| 群組同步連動 | **第一版不做**，旅程穩定後再加 |
| 刪除旅程 | 走**垃圾桶**（軟刪除），避免手滑；永久刪除才連同帳目刪除，**放在最後一個階段做**，並支援**滿 30 天自動永久刪除**（見 3.6）。垃圾桶完成前，旅程只能「封存」，不能刪除 |
| 旅程總花費 | **支出扣掉收入**（退稅等） |
| 計算機設定 | 存**雲端**（換裝置不用重設）；**不做鍵盤震動** |
| 鍵盤 | **新做** `FxKeypad`，不沿用 `NumberPad` |

### 第一版不做
- 歷史匯率圖表、更多幣別（沿用現有 29 種）。
- 群組同步歸到旅程。
- 鍵盤震動、播放開場動畫、「整理幣別」按鈕、顯示幣別名稱。

## 2. 資料模型

### 2.1 旅程 `users/{uid}/ledgers/{ledgerId}/trips/{tripId}`
| 欄位 | 型別 | 說明 |
|---|---|---|
| `name` | string 1–20 | 旅程名稱（「2026 大分溫泉」） |
| `currency` | string（3 碼） | 旅遊幣別（JPY），計算機預設以它為輸入列 |
| `startDate`、`endDate` | `'YYYY-MM-DD'`，選填 | 只做顯示與排序 |
| `countInStats` | bool，選填 | 計入個人統計（月曆、圖表、預算）；沒有或 false 就不計入 |
| `deletedAt` | timestamp，選填 | 有值＝在垃圾桶（見 3.6） |
| `rows` | 字串陣列（≤ 6 個三碼幣別），選填 | 計算機的換算列；沒有就用「旅遊幣別、統計幣別」加預設幾種 |
| `payCurrency` | 三碼幣別，選填 | 「實付」幣別，預設旅遊幣別 |
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
另新增個人設定文件 `users/{uid}/settings/fx`（沿用 `settings/profile` 的寫法，只有本人可讀寫）：
| 欄位 | 說明 |
|---|---|
| `decimals` | 小數位數，0–3，預設 1 |
| `defaultAmount` | 開啟時的預設金額（≥ 0），預設 1 |
| `showSymbol` | 是否顯示幣別符號，預設開 |
| `taxFreePercent`、`cardFeePercent` | 免稅（預設 10）與刷卡手續費（預設 1.5）的百分比，0–100 |
| `customRates` | 自訂匯率，鍵為 `FROM_TO`（例如 `JPY_TWD`），值為正數，最多 20 組；有自訂就優先於 API 匯率 |
`hasOnly` 白名單逐欄驗證。

測試：`firestore-tests/ledger.rules.mjs` 補旅程、`tripId`、`settings/fx` 的通過與拒絕案例，`npm run test:rules`。

### 2.5 查詢與索引
- 旅程頁：`where('tripId', '==', id)`，單欄位等值查詢，**不需要複合索引**，前端自己依日期排序。
- Firestore 無法查「沒有 `tripId`」的文件，所以個人統計的排除在前端過濾（見 3.1）。

## 3. 對既有功能的影響

### 3.1 月曆與統計排除（單一過濾點）
月曆、圖表（月、年、趨勢）、預算全都從 `hooks.js` 的三個 hook 取帳目：`useMonthTransactions`、`useYearTransactions`、`useMonthsOnce`。**在這三個 hook 回傳前過濾，下游全部自動排除**，不用逐頁改。要排除的帳目 = 有 `tripId`，且那趟旅程「沒有開計入統計」或「在垃圾桶」。

修改前（`useMonthTransactions` 內）：
```js
const list = snap.docs.map(withId).sort(...)
```
修改後：
```js
const list = snap.docs.map(withId).sort(...)   // 快取與訂閱結果不過濾
// hook 回傳時才過濾（useMemo），旅程的開關一變立即生效
return useMemo(() => state.list?.filter((tx) => isPersonalTx(tx, hiddenTrips)) ?? null, [state.list, hiddenTrips])
```
`useYearTransactions`、`useMonthsOnce` 同樣在回傳時過濾（`useMonthsOnce` 的記憶體快取存原始帳目，不存過濾後的）。讀取量不變（本來就整月讀進來）。
- `hiddenTrips`：`Set` of `tripId`，由 `LedgerProvider` 訂閱 `trips`（每個帳本一次，筆數很少）後以 `hiddenTripIds(trips)` 算出；旅程載入前三個 hook 回傳 `null`（顯示載入中），避免旅程帳目閃現一下又消失。
- 純函式放在 `summary.js`：`hiddenTripIds(trips)`（沒開 `countInStats` 或有 `deletedAt` 的旅程 id）、`isPersonalTx(tx, hiddenTrips)`（沒有 `tripId`，或 `tripId` 不在 `hiddenTrips`；**找不到旅程的 `tripId` 視為一般帳目**，不讓帳目憑空消失）。有單元測試。
- 垃圾桶中的旅程，即使開了「計入統計」也一律排除。

### 3.2 帳戶餘額與淨資產
不改。旅程帳目有 `accountId` 與 `accountAmount`，`balance.js` 照常計算；「重新計算餘額」讀全部帳目，自然包含旅程帳目。

### 3.3 備份與還原（`backup.js`、`backupData.js`）
- `TX_FIELDS` 加 `tripId`；備份新增 `trips` 陣列（含 `countInStats`、`deletedAt`、`rows`、`payCurrency`）；`users/{uid}/settings/fx` 是帳號層級設定，**不在帳本備份內**；`BACKUP_VERSION` 維持 1（`trips` 缺少時視為空，舊備份仍可還原）。
- `parseBackup` 驗證：`tripId` 必須對得到 `trips` 裡的 id；旅程 id 不重複。
- `planRestore`／`restoreBackup`：旅程在帳目之前寫入。

### 3.4 CSV 匯出（`csvExport.js`）
多一欄「旅程」（旅程名稱，沒有則空白）；整個帳本全部帳目照舊都匯出。

### 3.5 刪除帳本與合併帳號
`deleteLedger` 用 `recursiveDelete`、`movePersonalData` 遞迴搬移，`trips` 子集合自動包含，**後端不用改**。旅程 id 是自動 id，合併時不衝突。

### 3.6 刪除旅程
**垃圾桶（軟刪除，第六階段才做；之前旅程只能封存）**：
- 旅程頁選單的「刪除旅程」只在旅程文件寫入 `deletedAt`，帳目**完全不動**，所以可以隨時還原。
- 在垃圾桶裡的旅程：不出現在旅程切換清單、不能記帳；它的帳目不計入個人統計（3.1）。**帳戶餘額仍包含這些帳目**，垃圾桶頁會註明「永久刪除時才會退回餘額」。
- **垃圾桶頁**（`TripTrashPage`，從匯率設定頁進入）：列出旅程、筆數、刪除日期與**剩餘天數**；每列「還原」與「永久刪除」。手動永久刪除要二次確認（顯示筆數與會退回的餘額）。
- **永久刪除的做法**（手動與自動共用 `purgeTrip`）：帳目分批處理（每批 ≤ 200 筆），**每批在一個 Firestore 交易裡**先讀取帳目、只對「還存在」的帳目刪除並以 `increment` 退回帳戶餘額，全部處理完最後才刪旅程文件。用交易是為了避免兩個分頁或自動與手動同時執行時重複退款；中途失敗時旅程仍在垃圾桶，下次可繼續（已刪的帳目不會再退一次）。
- **滿 30 天自動永久刪除**：專案沒有後端排程（見個人記帳 guide「為什麼不用排程」），所以和固定收支一樣在**開啟匯率頁時補做**（`useTrashPurge`）：
  - 條件：`deletedAt` 已有伺服器時間（剛寫入、時間未確認的略過），且距今 ≥ 30 天（以裝置時間比對）。
  - 每次最多處理 1,000 筆帳目，其餘下次開啟再處理；每個旅程獨立處理，一個失敗不影響其他，只記錄錯誤。
  - 只處理目前帳本的旅程；沒開匯率頁就不會刪，這是可接受的（垃圾桶本來就是安全網）。
  - 自動刪除不另外跳提示，垃圾桶頁的剩餘天數就是預告；刪除後若有退回餘額，顯示一則提示「已自動清除 N 趟過期旅程」。

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
| `fxMath.js` | 純函式：多列換算、實付計算（免稅、刷卡）、小數位數取整（有單元測試） |
| `fxSettings.js`、`useFxSettings.js` | 讀寫 `users/{uid}/settings/fx`（小數位數、預設金額、顯示符號、免稅與刷卡百分比、自訂匯率）；預設值與驗證為純函式（有單元測試）。換算列與實付幣別存在旅程文件上（`rows`、`payCurrency`） |
| `FxKeypad.jsx` | 計算機鍵盤（截圖版面：收據鍵、C、⌫、÷ × − +、數字、00、小數點、＝）；算式規則沿用 `expression.js` |
| `TripTrashPage.jsx` | 垃圾桶頁：還原與永久刪除，顯示剩餘天數（3.6，第六階段） |
| `useTrashPurge.js` | 開啟匯率頁時自動永久刪除滿 30 天的旅程（3.6，第六階段） |
| `FxSettingsPage.jsx` | 設定頁（截圖 2）：小數位數、預設金額、顯示幣別符號、免稅與刷卡百分比、自訂匯率（外觀沿用全站主題，不另做） |
| `TripDetailPage.jsx` | 旅程明細（截圖 3）：總花費卡、依日期分組列表、「＋記帳」 |
| `tripSummary.js` | 純函式：總花費（支出扣掉收入；統計幣別與旅遊幣別）、依日分組與每日小計（有單元測試） |
| `TripSheet.jsx` | 新增、編輯旅程的底部面板（名稱、旅遊幣別、日期、「計入個人統計」開關、封存）；第六階段加上「刪除旅程」（移到垃圾桶） |
| `hooks.js` | `useTrips(uid, ledgerId)`、`useTripTransactions(uid, ledgerId, tripId)` |
| `data.js` | `createTrip`、`updateTrip`、`trashTrip`、`restoreTrip`、`purgeTrip`（永久刪除並退回餘額）；寫入走資料層，畫面不直接組路徑 |

### 4.3 修改既有檔案
| 檔案 | 修改 |
|---|---|
| `src/App.jsx:174` | `/fx` 的 `ComingSoonPage` → `/fx/*` 的 `FxShell`（lazy） |
| `src/features/ledger/paths.js` | 新增 `tripsPath` |
| `src/features/ledger/hooks.js` | 三個帳目 hook 新增參數 `hiddenTrips` 並在回傳時過濾（3.1）；新增 `useTrips` 共用（`LedgerProvider` 訂閱） |
| `src/features/ledger/summary.js` | 新增 `hiddenTripIds`、`isPersonalTx` |
| `src/features/ledger/entryDraft.js` | draft 帶 `tripId`、輸出到帳目、`draftFromTransaction` 保留 `tripId` |
| `src/features/ledger/LedgerEntrySheet.jsx` | 接受預填（`preset`），見第 5 節 |
| `src/features/ledger/backup.js`、`backupData.js`、`csvExport.js` | 見 3.3、3.4 |
| `firestore.rules`、`firestore-tests/ledger.rules.mjs` | 旅程、`tripId`、`settings/fx`，見 2.4 |
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

1. 使用者在計算機輸入金額（算式沿用 `expression.js`，不用 `eval`），游標所在的那一列是「輸入幣別」，其他列即時換算；換算列下方顯示「實付」（見下）。
2. 按收據鍵：`openEntry({ preset })` 彈出記帳面板，預填：
   - `amount`：**實付金額**（已含免稅與刷卡手續費，算式先算出結果）。
   - `currency`：**實付幣別**（鍵盤上方的幣別鈕選的那個，不是游標所在的列）。
   - `baseRate`：計算機目前使用的匯率（若使用者設了自訂匯率就用它）。
   - `tripId`：頁首選的旅程；沒選旅程時不能記（收據鍵提示先選或建立旅程）。
   - `sourceType: 'fx'`、`date` 今天、`kind` 支出。
3. 使用者只需補：類別、付款帳戶、備註，按儲存。
4. 儲存後面板關閉，計算機清空（保留旅程與換算列），旅程頁立即多一筆（即時訂閱）。「再記一筆」沿用面板現有行為。
5. 面板是**預填模式**：既有的 `?amount=&currency=&rate=&source=fx` 網址參數仍保留給其他入口使用。

**實付與兩個修飾鈕**（依截圖 4 的數字驗算）：換算列下方顯示「實付 JPY ¥11,749.8」，實付幣別用鍵盤上方的幣別鈕選。兩個修飾鈕可各自開關，順序固定「先免稅、再刷卡」：
- **免稅 −p%**：價格含稅 p% 時扣掉稅金，`扣掉的金額 = 金額 − 金額 ÷ (1 + p/100)`。截圖驗算：12,733.7 − 12,733.7 ÷ 1.1 = 1,157.6，與畫面一致。**標示是「−10%」，實際是除以 1.1，不是乘 0.9。**
- **刷卡 +f%**：加在免稅後的金額上，`+ 免稅後金額 × f/100`。截圖驗算：11,576.1 × 1.5% = +173.6，與畫面一致。
- 實付 = 免稅後金額 + 刷卡手續費（11,576.1 + 173.6 ≈ 11,749.8；截圖差 0.1 是畫面金額已四捨五入，實作用未取整的值計算，最後才取整）。
- p 預設 10、f 預設 1.5，可在設定頁修改（存雲端）。
**記帳時的金額**：`amount` = 實付金額，所以手續費也計入旅程總花費與統計幣別金額；所選帳戶幣別與實付幣別不同時，`accountAmount` 照現有邏輯依匯率估算，使用者可手動改成對帳單的實際扣款。

**編輯與刪除**：旅程頁點一筆帳目，開同一個面板編輯（沿用 `draftFromTransaction`，保留 `tripId`）；刪除會退回餘額（現有行為）。

## 6. 畫面與主題

- 全部使用專案 `--cs-*` 主題變數，支援暗黑模式，並通過 `npm run check:colors`。截圖的紅色強調色用 `--cs-rc-stamp`／`--cs-rc-stamp-text`，不另外寫死顏色。
- 計算機鍵盤：**新做** `FxKeypad.jsx`（截圖版面，多了「00」與收據鍵），算式規則沿用 `expression.js`，不改 `NumberPad.jsx`。
- 旅程頁沒有月曆，風格比照截圖 3：總花費卡＋依日分組列表；底部列用 `FeatureTabBar`，中間凸起鈕是「記帳」。
- **訪客**：沒有個人記帳。計算機仍可使用（純換算）；收據鍵與旅程入口灰色並提示，同記帳與目標的做法；訪客不掛 `LedgerProvider`。
- 一個旅程的總花費：
  - 統計幣別總額 = 旅程內支出 `baseAmount` 加總**扣掉**收入 `baseAmount` 加總（退稅等）。
  - 旅遊幣別總額 = 幣別等於旅程幣別的帳目 `amount`，支出加、收入減。
  - 每日小計 = 當日支出扣掉收入的 `baseAmount`（統計幣別）。

## 7. 實作順序（每階段都跑 `npm run lint`、`npm test`、`npm run build`）

1. **資料與規則**：`tripsPath`、rules、`tripId` 欄位、`entryDraft`、三個 hook 的過濾、`isPersonalTx`、備份與 CSV。含 rules 測試與兩個帳號實測（見 `docs/guides/operations.md`）。此階段沒有新畫面，但個人記帳完全不受影響。
2. **Provider 抽出**：`LedgerProvider`、`LedgerShell` 改寫，確認個人記帳行為不變。
3. **旅程頁**：`FxShell`、`useTrips`、`TripSheet`、`TripDetailPage`、`tripSummary`。此時可用記帳面板手動記到旅程；旅程只能封存，不能刪除。
4. **計算機頁**：`fxMath`、`FxCalculatorPage`、鍵盤、收據鍵預填。
5. **設定頁與收尾**：`FxSettingsPage`、`fxSettings`、自訂匯率、i18n、文件（此時可先上線，垃圾桶尚未完成）。
6. **垃圾桶**：`TripSheet` 的「刪除旅程」、`trashTrip`／`restoreTrip`／`purgeTrip`、`TripTrashPage`、`useTrashPurge`（滿 30 天自動永久刪除）；包含永久刪除交易與重複執行的測試。

規定：rules 與前端放同一個 PR（CI 推 `main` 就部署）。

## 8. 確認紀錄

全部已確認（2026-11-26）：
- 統計開關（每趟旅程，預設關）；總花費扣掉收入；免稅與刷卡的位置依 App 截圖（換算列下方、先免稅再刷卡）；設定存雲端；鍵盤新做、**不做鍵盤震動**。
- 垃圾桶**留到最後（第六階段）**，支援滿 30 天自動永久刪除；垃圾桶中旅程的帳目在永久刪除前仍計入帳戶餘額。
- 記帳金額記「實付」（含免稅調整與刷卡手續費），手續費計入旅程花費與統計幣別金額。
- 自訂匯率：有自訂就優先於 API 匯率；設定畫面細節（新增、刪除）在第五階段實作前再給使用者看畫面。

## 9. 完成後要更新的文件
`README.md` 功能清單、`docs/guides/currency.md`、`docs/guides/personal-ledger.md`（結構、帳目欄位、備份、CSV、移除「尚未做」裡的匯率頁入口）、`docs/guides/data-model.md`、`docs/guides/architecture.md`；本 spec 與 backlog 的匯率頁部分搬到 `archive/`，更新 [`README.md`](README.md) 索引。
