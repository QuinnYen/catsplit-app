# P12 個人記帳（設計）

日期：2026-11-14　狀態：待審閱
前置：整體架構決策見 `2026-11-14-p14-identity-design.md`（同一專案、功能模組分界、不拆微服務；順序 P14 → P12 → 匯率頁 → P18）。

## 目標

在 `users/{uid}` 下建立只有本人可見的個人帳本，並與其他兩個功能互通：

```
匯率換算 ──「記一筆」──▶ 個人帳本 ◀──「匯入我的分攤」── 分帳群組
```

## 已確認的決定

| 項目 | 決定 |
|---|---|
| 資料模型 | 個人帳本 `users/{uid}/transactions`（不用一人群組） |
| 群組匯入 | 快照匯入，可手動更新；每個群組一筆，固定 id，覆寫不重複 |
| 第一版範圍 | 收入＋支出、分類、帳戶（重用 `spendMethods`）、月報表與統計 |
| 多幣別 | 主要幣別，入帳當下換算並存 `baseAmount` |
| 預算 | 延後，待 P8 分類預算結構定案後共用 |
| 訪客 | 不能使用 |

## 1. 資料模型

集合 `users/{uid}/transactions/{id}`，只有本人可讀寫，訪客拒絕。

| 欄位 | 說明 |
|---|---|
| `type` | `income` 或 `expense` |
| `amount`、`currency` | 原幣金額與幣別（`CURRENCIES` 的代碼） |
| `exchangeRate`、`baseAmount` | 入帳當下匯率與換算成主要幣別的金額；同幣別時匯率 1、`baseAmount = amount` |
| `category` | 內建分類代碼或自訂文字 |
| `spendMethodId` | 選填，指向 `users/{uid}/spendMethods` |
| `note`、`date`、`createdAt` | 備註（≤ 50 字）、`YYYY-MM-DD`、建立時間 |
| `source` | `{ type: 'manual' \| 'fx' \| 'group', groupId? }` |

- **主要幣別**：`users/{uid}/settings/profile.mainCurrency`，預設 TWD。**已有帳目後不可更改**（比照儲蓄目標「貨幣建立後不可改」），避免舊 `baseAmount` 單位混亂。
- **統計只加總 `baseAmount`**，不重算匯率，匯率日後波動不影響舊帳。換算沿用 `useExchangeRate` 與 `applyExchangeRate` 的思路。
- **分類**：支出沿用 `DEFAULT_CATEGORIES`（含自訂文字）；個人收入用新的一組：薪資、獎金、投資、退款、其他（不沿用群組的墊付與補助）。
- **群組匯入**：固定 id `group_{groupId}`，內容為「我在該群組所有支出 `splits[uid]` 的加總」（含所有分帳方式，不只均分），群組幣別與主要幣別不同時照同一方式換算。重複匯入或按「更新」都覆寫同一筆。日期預設匯入當天，可修改。群組刪除或退出後，個人帳目仍保留。

## 2. 介面與流程

- **路由**：`/ledger`（月份切換、收支合計、帳目列表）、`/ledger/new`、`/ledger/:id/edit`、`/ledger/stats`（分類占比、帳戶支出、收支趨勢）。
- **入口**：先放首頁頭像選單，與「儲蓄目標」並列；整合入口留給 P18。
- **匯率頁預留介面**：`/ledger/new?amount=…&currency=…&rate=…&source=fx`，新增表單讀 query 自動帶入。匯率頁本身是後續子專案，此處只定這個約定。
- **匯入群組分攤**：帳本頁按鈕 → 列出我加入的群組 → 選定後顯示總額 → 確認才寫入；已匯入的顯示「更新」。
- **重用**：`useExchangeRate`、`MonthPicker`、`CalculatorModal`、`DateTimeField`、`spendMethods`／`sumBySpendMethod`；表單與統計中綁定群組的部分要先抽成通用版本。程式放 `src/features/ledger/`。

## 3. rules、測試、刪除

- **rules**：`transactions` 僅本人可讀寫且為非訪客（現用 `isLineUser()`，P14 改名 `isMember()` 時一併跟著改）；驗證 `type`、`currency` 在 `CURRENCIES` 內、`amount` 與 `baseAmount` 為大於 0 且小於 1e12 的數字。補 `firestore-tests/ledger.rules.mjs`。
- **單元測試**：月份加總、依分類加總、群組分攤加總、固定 id 覆寫的冪等性、主要幣別已有帳目時不可改。
- **刪除我的資料**：`deleteMyData` 涵蓋 `transactions`；`public/privacy.html`（中英文）補寫個人帳本資料。
- **文件**：新增 `docs/personal-ledger.md`，更新 `README.md`。
- **與 P14**：P12 不依賴 P14 完成。P14 的 `mergeAccounts` 搬移 `users/{dropUid}/…` 時必須包含 `transactions`（含 `source.groupId` 的快照），並遵守「同 id 衝突以 `keepUid` 為準」；`group_{groupId}` 這類固定 id 在兩邊都有時以 `keepUid` 為準。

## 風險

- 抽出通用表單與統計時不可破壞既有群組頁的行為，先確保現有測試通過再抽。
- 匯率來源（open.er-api.com）失敗時，記帳要能手動輸入匯率（`useExchangeRate` 已支援 `setManualRate`）。
- 群組匯入的是快照，使用者可能誤以為會自動同步，介面需明示「更新」才會重算。

## 不在本項範圍

預算（等 P8）、CSV 匯出、帳戶間轉帳、重複性記帳、匯率換算頁本身、P18 首頁整合。
