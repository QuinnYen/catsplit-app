# 儲蓄目標

LINE 使用者可在首頁頭像選單的「儲蓄目標」建立多個個人目標，記錄存款與提款，查看進度與明細。個人私有，不與群組或分帳連動；訪客不能使用（選單不顯示、路由導回首頁、rules 拒絕寫入）。

## 頁面

| 路徑 | 說明 |
|---|---|
| `/savings` | 目標列表，每張卡片顯示標題、已存／目標金額與進度條 |
| `/savings/new` | 建立目標：標題、目標金額、貨幣、目標日期（選填） |
| `/savings/:goalId` | 儲蓄頁：已存金額、進度條、目標日期（剩餘天數、今天到期、已逾期）、新增紀錄、編輯與刪除目標 |
| `/savings/:goalId/edit` | 編輯目標；貨幣建立後不可改 |
| `/savings/:goalId/entries` | 明細：全部紀錄由新到舊，可編輯、刪除 |

## 資料結構

`users/{uid}/savingsGoals/{goalId}`：`title`（1～50 字）、`targetAmount`（> 0）、`currency`（`CURRENCIES` 的代碼）、`targetDate`（`YYYY-MM-DD` 或 `null`）、`createdAt`。

`users/{uid}/savingsGoals/{goalId}/entries/{entryId}`：`type`（`save` 或 `withdraw`）、`amount`（一律正數）、`title`（可空，最多 100 字）、`date`（`YYYY-MM-DD`）、`createdAt`。

已存金額不另存：前端監聽 `entries` 後加總（存款 − 提款，`src/utils/savings.js`）。這樣編輯、刪除紀錄不需要維護第二份資料。

## 規則

- 提款不設限，餘額可為負；存款可超過目標。進度條夾在 0～100%，達到目標顯示「已達成」。
- 每個目標單一貨幣，不做匯率換算。
- rules：只有本人能讀寫，且寫入需為 LINE 使用者；金額須為大於 0 且小於 1e12 的數字（`firestore-tests/savings.rules.mjs`）。
- 刪除目標時先刪光 `entries` 再刪目標（`src/utils/savingsData.js`），中途失敗時目標仍在，重試即可。「刪除我的資料」也會一併清除。

## 不做

匯率換算、多幣別目標、每日應存金額推算、提醒通知、分享或公開目標。
