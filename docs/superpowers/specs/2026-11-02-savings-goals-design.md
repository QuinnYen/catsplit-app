# 儲蓄目標（Savings Goals）設計

日期：2026-11-02

## 目的

讓 LINE 使用者在首頁頭像選單的「收款方式」下方進入「儲蓄目標」，自行建立多個個人儲蓄目標，記錄存款與提款，並看到進度。

## 範圍與假設

- 個人私有，不公開、不與群組或分帳連動。
- 只開放 LINE 使用者，訪客不顯示入口，路由也擋掉（與收款方式相同）。
- 一位使用者可有多個目標。
- 每個目標單一貨幣，不做匯率換算；已存金額 = 紀錄加總。
- 提款不設限，餘額可為負；存款可超過目標。進度條夾在 0～100%。
- 目標日期選填。
- 不做「每天需存多少」之類的推算（YAGNI）。

## 路由

| 路徑 | 頁面 |
|---|---|
| `/savings` | 目標列表：每張卡片顯示標題、已存／目標金額、進度條；右上角新增按鈕 |
| `/savings/new` | 建立目標：標題、目標金額、貨幣（`CURRENCIES`）、目標日期（選填） |
| `/savings/:goalId` | 儲蓄頁：標題、已存金額、進度條、目標日期（剩餘天數／已逾期）、「新增紀錄」、編輯與刪除目標、進入明細 |
| `/savings/:goalId/entries` | 明細頁：全部紀錄按日期倒序，可編輯、刪除 |

儲蓄頁不列紀錄，紀錄全部在明細頁。訪客進入任一路徑一律導回 `/`。

## 資料

`users/{uid}/savingsGoals/{goalId}`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `title` | string | 必填 |
| `targetAmount` | number | > 0 |
| `currency` | string | `CURRENCIES` 的 code，建立後不可改 |
| `targetDate` | string \| null | `YYYY-MM-DD`，選填 |
| `createdAt` | timestamp | |

`users/{uid}/savingsGoals/{goalId}/entries/{entryId}`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `type` | `'save'` \| `'withdraw'` | |
| `amount` | number | 一律存正數，> 0 |
| `title` | string | |
| `date` | string | `YYYY-MM-DD` |
| `createdAt` | timestamp | |

已存金額不另存，由前端監聽 `entries` 後加總：`Σ save − Σ withdraw`。
進度 = `clamp(已存 ÷ targetAmount, 0, 1)`。
目標列表每張卡片各自監聽自己的 `entries`（個人紀錄量小，可接受）。

選擇即時加總而非在目標文件冗餘 `saved`：避免兩處資料不一致，編輯、刪除紀錄不需額外處理。

## 純函式（`src/utils/savings.js`）

- `sumSaved(entries)`：回傳已存金額。
- `progressRatio(saved, target)`：回傳 0～1。
- `daysLeft(targetDate, today)`：回傳剩餘天數；已逾期為負數；無日期為 `null`。

先寫 `node --test` 測試再實作。

## 金額顯示

沿用專案現況：`getCurrency(code).symbol` 加 `fmt.num`（`format.js` 沒有幣別格式化）。

## 刪除

- 刪除目標時一併刪除其 `entries`（客戶端逐筆刪除後再刪目標，與 `deleteMyData` 同風格）。
- `src/utils/deleteMyData.js` 補上清除所有 `savingsGoals` 及其 `entries`。

## Firestore rules

在 `firestore.rules` 新增兩層，皆為本人才能讀寫（`isLineUser()` 且 `auth.uid == userId`）：

- `savingsGoals`：`title` 為非空 string；`targetAmount` 為 number 且 > 0 並設上限；`currency` 為 string；`targetDate` 為 string 或 null。
- `entries`：`type` 為 `save` 或 `withdraw`；`amount` 為 number 且 > 0 並設上限；`title`、`date` 為 string。

## 周邊

- 入口：`HomePage.jsx` 頭像選單在「收款方式」下新增「儲蓄目標」，訪客不顯示。
- 路由：`App.jsx` 新增四條，訪客導回 `/`。
- i18n：`zh-TW.js` 與 `en.js` 補字典（`savings.*`、`home.menu.savings`）。
- 樣式：沿用現有卡片、`PawDecor` 與色票。
- 文件：新增 `docs/savings-goals.md`，README 的功能與文件清單各補一行。
- 驗證：`npm run lint`、`npm test`、`npm run build`，並用模擬器實測建立、記錄、刪除與 rules 拒絕他人讀寫。

## 不做

- 匯率換算、多幣別目標。
- 每日應存金額推算、提醒通知。
- 分享或公開目標。
