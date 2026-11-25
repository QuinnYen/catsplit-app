# 個人記帳

底部導覽列「記帳」進入個人帳本：多個帳本、帳戶與多幣別帳目、月曆主頁。只有本人看得到；訪客不能使用（導覽列灰色並提示）。設計當時的決定見 [P12 spec](../superpowers/archive/2026-11-14-p12-personal-ledger-design.md)，實作順序見[計畫](../superpowers/archive/2026-11-24-p12-ledger-plan.md)（皆已封存）。

**已上線（2026-11-25）**：帳本切換與新增、月曆主頁、記帳面板（支出、收入、轉帳）、編輯與刪除、刪除帳本、帳戶管理與淨資產、重新計算餘額、圖表、連結分帳群組（同步與匯入）。

## 結構

```
users/{uid}/ledgers/{ledgerId}                       帳本（名稱、統計幣別）
users/{uid}/ledgers/{ledgerId}/accounts/{accountId}  帳戶（單一幣別、餘額）
users/{uid}/ledgers/{ledgerId}/transactions/{id}     帳目（收入、支出、轉帳）
users/{uid}/ledgers/{ledgerId}/groupLinks/{groupId}  連結的分帳群組
```

欄位、rules 與取捨見 [資料模型](data-model.md) 與封存的 spec 第 1 節。第一次進入會自動建立 id 固定為 `default` 的「我的帳本」（TWD）與一個「現金」帳戶；新增帳本時同樣會建立「現金」帳戶（幣別 = 統計幣別）。

## 程式在哪裡

| 路徑 | 內容 |
|---|---|
| `src/features/ledger/` | 全部個人帳本的程式 |
| `LedgerShell.jsx` | `/ledger/*` 的殼層：載入帳本與帳戶、導覽列、記帳面板、提示 |
| `LedgerBookPage.jsx`、`LedgerMenu.jsx` | 帳本主頁（月曆與當日明細）、帳本切換與新增 |
| `LedgerEntrySheet.jsx`、`NumberPad.jsx` | 記帳面板與常駐數字鍵盤 |
| `LedgerAccountsPage.jsx`、`AccountSheet.jsx`、`netWorth.js` | 帳戶頁（淨資產、清單、封存區、重新計算餘額）、新增與編輯帳戶、淨資產計算（純函式） |
| `LedgerStatsPage.jsx` | 圖表：分類占比（支出／收入）、近 6 個月趨勢，月份可切換 |
| `LedgerSettingsPage.jsx` | 帳本設定，分頁呈現（網址 `?tab=`）；目前只有「分帳」，只有一個分頁時不顯示分頁列，之後規劃基本、進階、資料 |
| `data.js`、`hooks.js` | Firestore 讀寫與即時訂閱（畫面不直接組路徑或寫 batch） |
| `entryDraft.js`、`money.js`、`balance.js`、`summary.js` | 草稿轉帳目、換算、餘額增量、月彙總（純函式，有單元測試） |
| `expression.js` | 數字鍵盤的算式規則，不用 `eval` |
| `syncPlan.js`、`importPlan.js` | 群組同步與匯入快照的計畫（純函式） |
| `groupSync.js`、`useLedgerSync.js` | 連結、同步、取消連結、匯入的 Firestore 讀寫；開啟帳本時自動同步的 hook |
| `LedgerGroupLinks.jsx`、`GroupImportDialog.jsx`、`SnapshotTxSheet.jsx` | 設定頁的連結列與匯入、群組帳目的唯讀面板 |
| `batch.js` | 大量寫入分批（每批 ≤ 400） |
| `prefs.js`、`dates.js` | 本機偏好（目前帳本、最近用的帳戶與分類）、日期輔助 |

## 金額與幣別

- 每筆收入與支出記**實際花的幣別與金額**（`currency`、`amount`）、當下匯率與換成帳本統計幣別的金額（`exchangeRate`、`baseAmount`）。統計只加總 `baseAmount`，之後不重算。
- 帳戶幣別與帳目幣別不同時，另記對帳戶餘額的影響 `accountAmount`（由 `accountRate` 估算，可手動改成實際扣款金額）。帳戶幣別等於統計幣別時，扣款匯率直接沿用統計匯率，不用輸入第二次。
- 轉帳記轉出金額 `amount` 與轉入金額 `toAmount`，不計入收支，跨幣別時兩者不同。
- 帳戶 `balance` 在記帳、編輯、刪除時於同一個 batch 用 `increment` 更新（增量由 `balance.js` 算）。帳戶頁的「重新計算餘額」會讀取整個帳本的帳目，依「期初餘額＋帳目」重算每個帳戶並寫回（快照帳戶不處理）。
- 匯率用 `useExchangeRate`（open.er-api.com），抓取失敗時要手動輸入。

## 記帳面板

從底部彈出：支出／收入／轉帳切換 → 日期（整行，點了跳出日期選擇）→ 類別與帳戶下拉 → 備註 → 金額列（幣別、算式與結果）→ 換算資訊 → 數字鍵盤 → 「再記一筆／儲存」。

- 金額最先：有 `+ − × ÷` 時主按鈕變「＝」，先算出結果，再按一次才儲存。
- 日期預設帶月曆選取的那天；帳戶與類別預設帶最近用的（存在本機，每個帳本各一份）。
- 手動帳目沒有標題欄位：列表顯示備註，沒有備註就顯示類別。
- 編輯舊帳時沿用當時存的匯率；刪除會把對餘額的影響退回去。

## 帳戶管理

- 帳戶頁右上「＋」新增：名稱、種類、幣別（建立後不可改）、期初餘額（信用卡欠款填負數）。點帳戶可編輯名稱、種類、期初餘額；改期初餘額時目前餘額跟著加上差額（`increment`）。
- **封存**：不能再記帳，帳目與餘額保留，淨資產仍計入；**刪除**只限沒有帳目的帳戶（查 `accountId` 與 `toAccountId`，rules 無法擋，只在前端）。最後一個可用帳戶不能封存或刪除；最多 30 個帳戶（前端限制）。
- **淨資產**：外幣帳戶以 `open.er-api.com` 的目前匯率換成統計幣別，取不到匯率的幣別不計入並提示；快照帳戶不計入。
- **重新計算餘額**：讀整個帳本的帳目，與記錄的餘額不同的帳戶才寫回。

## 連結分帳群組

設定頁「連結分帳群組」：每列左邊群組下拉、右邊開關；底下分隔線後有「重新整理」與靠右的「匯入到帳戶」。

- **開啟**：寫入 `groupLinks/{群組id}` 與快照帳戶 `snap_{群組id}`（種類 `group`、幣別 = 統計幣別）。範圍是**群組的全部帳目，含連結前的歷史**（2026-11-25 起；原設計是「不帶歷史」，實測連結既有旅程群組會同步 0 筆，改掉了）。`linkedAt` 寫成最早的時間（epoch），同步時一律忽略，舊版連結存的「按下開關的時間」也不再限制範圍。
- **同步內容**：每筆群組帳目中「我的分攤」（`splits[uid]`，為 0 或贊助不產生），固定 id `g_{群組}_e_{帳目}`／`g_{群組}_i_{帳目}`，重複同步只是覆寫。外幣帳目的原幣份額 = `originalAmount × 分攤 ÷ 總額`；統計金額用群組基準幣的分攤，兩邊基準幣不同時優先用帳目的 `homeRate`（`homeCurrency` 等於統計幣別時），否則用同步當下的匯率並**凍結**（份額沒變就不重算）。
- **0 筆時的說明**：設定頁的連結列會說明「群組有 N 筆帳目，但沒有一筆分攤到你」或「群組還沒有帳目」，方便判斷原因。
- **時機**：開啟帳本時每個群組同步一次（`useLedgerSync`，一次性 `getDocs`，先比對再寫，只寫有變動的），之後按「重新整理」；其他成員記帳後需重新整理或重開。來源被刪或日期被改到連結前，快照帳目會被刪除。
- **快照帳目**：不影響任何帳戶餘額、不計入淨資產，但統計（圖表）會計入。點開是唯讀面板：金額、日期、標題來自群組；**分類與備註可改**，改過的記在 `source.edited`，之後同步不再覆寫。
- **關閉**：確認後刪除快照帳戶、尚未匯入的快照帳目與連結（改過的分類備註一併消失）；已匯入的一般帳目保留。
- **匯入到帳戶**：選群組與一般帳戶，預覽筆數與餘額變動；帳目與目標帳戶幣別不同時顯示匯率（自動帶入、可修改，抓不到要手動輸入），只新增 `accountAmount`／`accountRate`，統計金額不變。帳目以固定 id 就地改成 `detached` 一般帳目（可編輯、計入餘額、不再同步，編輯時保留 `source` 與標題），分批寫入並以 `increment` 更新餘額與快照帳戶；完成後詢問是否停止同步。
- **無法讀取的群組**（已退出或已刪除）：不動既有快照帳目，顯示提示，使用者可匯入保留或關閉同步。

## 圖表

- 主頁右上圓鈕進入 `/ledger/stats`。只加總 `baseAmount`（統計幣別），轉帳不計。
- 選定月份沿用即時訂閱；趨勢的其他月份各讀一次並快取在頁面記憶體，切換月份只補讀新的一個月，**沒有彙總文件、沒有新索引**。代價是讀取量隨帳目數增加：每天 20 筆時，看一次趨勢約讀 3,000 筆，使用者少時遠低於免費額度。
- 頁面開著時在別的月份新增帳目，趨勢的快取不會更新，離開再進來即可。

## 刪除

- **帳本改名與刪除**：帳本選單（左上圓鈕）每個帳本旁的鉛筆，展開名稱（統計幣別唯讀）與「刪除這個帳本」，至少要保留一個。客戶端不能刪帳本文件（rules 擋掉），由後端 `deleteLedger` 用 `recursiveDelete` 刪整棵子樹（帳戶、帳目、群組連結），沒有 500 筆上限。
- **刪除我的資料**：`detachMember`（`deleteAccount: true`）在刪 Auth 之前先刪 `users/{uid}/ledgers`，失敗就不刪帳號，使用者可以重試。
- 後端邏輯在 `functions/ledgerOps.js`，整合測試 `functions/emulator-tests/ledgerOps.mjs`（`npm run test:merge`）。

## 測試

- 純函式：`npm test`（`src/features/ledger/*.test.js`）。
- rules：`npm run test:rules`（`firestore-tests/ledger.rules.mjs`）。
- 介面：用模擬器開發（`npm run emulators` 與 `npm run dev`，開發模式會自動匿名登入），進 `/ledger` 實際操作；`deleteLedger` 需要含 functions 的模擬器，本機通常不啟動。

## 帳號合併

`movePersonalData` 遞迴搬移整棵 `users/{uid}`，帳本子樹連同 id 一起搬，帳目裡的 `accountId` 不會失效。

兩個帳號都開過帳本時，雙方的預設帳本（`default`）與現金帳戶（`cash`）是固定 id，會落入衝突處理，預設保留「保留帳號」那一份，帳戶 `balance` 因此不會相加。處理方式：`movePersonalData` 對雙方都有的帳本，搬完帳目後在後端（`functions/ledgerOps.js` 的 `recomputeLedgerBalances`）依帳目重算帳戶餘額；兩邊連結同一個群組時 `groupLinks` 取較早的 `linkedAt`。帳戶頁的「重新計算餘額」仍可手動修復。群組同步帳目的份額在合併後由下一次同步依新的分攤改寫。

## 尚未做（之後）

- 使用者自訂分類與分類圖示（設定頁），目前分類沿用群組的預設清單與個人收入清單。
- 新增帳本時選圖示或顏色。
- 匯率換算頁的「記一筆」入口（記帳面板已能讀 `?amount=&currency=&rate=&source=fx`）。
- 首頁摘要卡片、預算、重複性記帳、CSV 匯出、跨帳本總覽、帳目在帳本間移動、錢包式外幣帳戶（見 [specs 索引](../superpowers/specs/README.md)）。
- 本地快取（`persistentLocalCache`）：降低重複讀取，影響全站，需另開任務。
- 趨勢圖的讀取量隨帳目數增加；若出現重度使用者，優先把趨勢改成聚合查詢 `sum`（需手動部署複合索引）。
- 實機驗證：兩個真人帳號的群組同步、LINE 內建瀏覽器、正式環境的 `deleteLedger` 與自動帶入匯率。
