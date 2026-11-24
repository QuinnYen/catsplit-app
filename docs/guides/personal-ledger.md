# 個人記帳

底部導覽列「記帳」進入個人帳本：多個帳本、帳戶與多幣別帳目、月曆主頁。只有本人看得到；訪客不能使用（導覽列灰色並提示）。設計見 [P12 spec](../superpowers/specs/2026-11-14-p12-personal-ledger-design.md)，實作順序見[計畫](../superpowers/plans/2026-11-24-p12-ledger-plan.md)。

**目前已完成（PR3）**：帳本切換與新增、月曆主頁、記帳面板（支出、收入、轉帳）、編輯與刪除、刪除帳本、帳戶管理與淨資產、重新計算餘額。圖表（PR4）、連結分帳群組（PR5）還在開發，頁面先放「即將推出」。

## 結構

```
users/{uid}/ledgers/{ledgerId}                       帳本（名稱、統計幣別）
users/{uid}/ledgers/{ledgerId}/accounts/{accountId}  帳戶（單一幣別、餘額）
users/{uid}/ledgers/{ledgerId}/transactions/{id}     帳目（收入、支出、轉帳）
users/{uid}/ledgers/{ledgerId}/groupLinks/{groupId}  連結的分帳群組（PR5）
```

欄位、rules 與取捨見 [資料模型](data-model.md) 與 spec 第 1 節。第一次進入會自動建立 id 固定為 `default` 的「我的帳本」（TWD）與一個「現金」帳戶；新增帳本時同樣會建立「現金」帳戶（幣別 = 統計幣別）。

## 程式在哪裡

| 路徑 | 內容 |
|---|---|
| `src/features/ledger/` | 全部個人帳本的程式 |
| `LedgerShell.jsx` | `/ledger/*` 的殼層：載入帳本與帳戶、導覽列、記帳面板、提示 |
| `LedgerBookPage.jsx`、`LedgerMenu.jsx` | 帳本主頁（月曆與當日明細）、帳本切換與新增 |
| `LedgerEntrySheet.jsx`、`NumberPad.jsx` | 記帳面板與常駐數字鍵盤 |
| `LedgerAccountsPage.jsx`、`AccountSheet.jsx`、`netWorth.js` | 帳戶頁（淨資產、清單、封存區、重新計算餘額）、新增與編輯帳戶、淨資產計算（純函式） |
| `LedgerSettingsPage.jsx` | 帳本設定（目前只有資訊與刪除帳本） |
| `data.js`、`hooks.js` | Firestore 讀寫與即時訂閱（畫面不直接組路徑或寫 batch） |
| `entryDraft.js`、`money.js`、`balance.js`、`summary.js` | 草稿轉帳目、換算、餘額增量、月彙總（純函式，有單元測試） |
| `expression.js` | 數字鍵盤的算式規則，不用 `eval` |
| `syncPlan.js`、`importPlan.js` | 群組同步與匯入快照的計畫（純函式，PR5 才接上畫面） |
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

## 刪除

- **刪除帳本**：設定頁，至少要保留一個。客戶端不能刪帳本文件（rules 擋掉），由後端 `deleteLedger` 用 `recursiveDelete` 刪整棵子樹（帳戶、帳目、群組連結），沒有 500 筆上限。
- **刪除我的資料**：`detachMember`（`deleteAccount: true`）在刪 Auth 之前先刪 `users/{uid}/ledgers`，失敗就不刪帳號，使用者可以重試。
- 後端邏輯在 `functions/ledgerOps.js`，整合測試 `functions/emulator-tests/ledgerOps.mjs`（`npm run test:merge`）。

## 測試

- 純函式：`npm test`（`src/features/ledger/*.test.js`）。
- rules：`npm run test:rules`（`firestore-tests/ledger.rules.mjs`）。
- 介面：用模擬器開發（`npm run emulators` 與 `npm run dev`，開發模式會自動匿名登入），進 `/ledger` 實際操作；`deleteLedger` 需要含 functions 的模擬器，本機通常不啟動。

## 帳號合併

`movePersonalData` 遞迴搬移整棵 `users/{uid}`，帳本子樹連同 id 一起搬，帳目裡的 `accountId` 不會失效。

**已知限制**：兩個帳號都開過帳本時，雙方的預設帳本（`default`）與現金帳戶（`cash`）是固定 id，會落入衝突處理，預設保留「保留帳號」那一份；被併入帳號的帳目仍會搬進來，但**帳戶 `balance` 不會相加**，餘額可能與帳目不符。處理方式：到帳戶頁按「重新計算餘額」修復，PR5 評估在合併時自動重算並處理 `groupLinks` 的聯集。
