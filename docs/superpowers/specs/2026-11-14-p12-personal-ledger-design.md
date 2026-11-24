# P12 個人記帳（設計）

日期：2026-11-14　修訂：2026-11-24　狀態：決定已確認，待審閱
前置：整體架構決策見 [`../archive/2026-11-14-p14-identity-design.md`](../archive/2026-11-14-p14-identity-design.md)（同一專案、功能模組分界、不拆微服務）。P14 已上線；P18 第一階段已上線，底部導覽列的「記帳」Tab 目前是 `/ledger` 佔位頁，本項完成後取代它。

## 目標

在 `users/{uid}` 下建立只有本人可見的個人帳本，並與其他兩個功能互通：

```
匯率換算 ──「記一筆」──▶ 個人帳本 ◀──自動同步「我的分攤」── 已連結的分帳群組
```

## 已確認的決定

| 項目 | 決定 |
|---|---|
| 資料模型 | 個人帳本 `users/{uid}/transactions`（不用一人群組） |
| 群組互通 | **連結群組後自動同步**，每筆群組帳目對應一筆個人帳目（固定 id，覆寫不重複） |
| 口徑 | **分攤口徑**：取 `splits[uid]`（我真正的花費或應得份額）；群組的轉帳結算不進個人帳本 |
| 收入 | 群組收入一併帶入；贊助（`isSponsorship`）只動餘額，不帶入 |
| 歷史 | 不帶歷史：只同步**消費時間**（`createdAt`）在連結時間之後的帳目 |
| 連結開關 | 放在個人帳本頁；預設關閉；逐群組設定 |
| 取消連結 | 預設保留已同步的帳目（轉為一般帳目），可選擇一併刪除 |
| 第一版範圍 | 收入＋支出、分類、帳戶（重用 `spendMethods`）、月報表與統計 |
| 多幣別 | 主要幣別，入帳當下換算並存 `baseAmount` |
| 預算 | 延後，待 P8 分類預算結構定案後共用 |
| 訪客 | 不能使用（底部導覽列「記帳」灰色並提示） |

## 為什麼這樣設計：避免重複記帳

重複記帳有三種來源：同一筆在群組與個人各記一次、匯入後又手動補、重複匯入。重複匯入靠固定 id 解決；前兩種只能靠流程避免，所以群組帳目一律由**連結後自動帶入**，使用者不需要、也不應該在個人帳本再記一次。同步來的帳目是唯讀的（見下），這是避免重複的核心。

## 1. 資料模型

### 1.1 `users/{uid}/transactions/{id}`

只有本人可讀寫，訪客拒絕。

| 欄位 | 說明 |
|---|---|
| `type` | `income` 或 `expense` |
| `amount`、`currency` | 原幣金額與幣別（`CURRENCIES` 的代碼） |
| `exchangeRate`、`baseAmount` | 入帳當下匯率與換算成主要幣別的金額；同幣別時匯率 1、`baseAmount = amount` |
| `title` | 標題（手動帳目選填；同步帳目沿用群組帳目的 `title`） |
| `category` | 內建分類代碼或自訂文字 |
| `spendMethodId` | 選填，指向 `users/{uid}/spendMethods` |
| `note`、`date`、`createdAt` | 備註（≤ 50 字）、`YYYY-MM-DD`、建立時間 |
| `source` | `{ type: 'manual' \| 'fx' \| 'group', groupId?, kind?: 'expense' \| 'income', itemId?, detached?: true, edited?: { category?, note? } }` |

- **主要幣別**：`users/{uid}/settings/profile.mainCurrency`，預設 TWD。**已有帳目後不可更改**（比照儲蓄目標「貨幣建立後不可改」），避免舊 `baseAmount` 單位混亂。
- **統計只加總 `baseAmount`**，不重算匯率，匯率日後波動不影響舊帳。換算沿用 `useExchangeRate` 與 `applyExchangeRate` 的思路。
- **分類**：支出沿用 `DEFAULT_CATEGORIES`（含自訂文字）；個人收入用新的一組：薪資、獎金、投資、退款、其他（不沿用群組的墊付與補助）。群組收入的分類對應到個人收入分類時，對不上的一律歸「其他」。

### 1.2 `users/{uid}/settings/ledgerLinks`

```
{ groups: { [groupId]: { linkedAt: Timestamp } } }
```

固定 id 文件，只有本人可讀寫（非訪客）。`linkedAt` 是「不帶歷史」的分界：只同步 `createdAt >= linkedAt` 的群組帳目。

## 2. 群組同步

### 2.1 同步的內容

每筆在範圍內的群組帳目，在個人帳本產生一筆帳目：

| 來源 | 個人帳目 id | `type` | 金額 |
|---|---|---|---|
| `groups/{g}/expenses/{e}` | `g_{g}_e_{e}` | `expense` | `splits[uid]`（為 0 或不存在則不產生） |
| `groups/{g}/incomes/{i}` | `g_{g}_i_{i}` | `income` | `splits[uid]`；贊助不產生 |

- 日期、標題、分類沿用群組帳目；`source = { type: 'group', groupId, kind, itemId }`。
- **幣別**：群組基準幣與主要幣別相同則匯率 1；不同時，若帳目的 `homeCurrency` 等於主要幣別就用它的 `homeRate`，否則用**首次同步當下**的匯率。已同步帳目的匯率與 `baseAmount` 凍結，只有分攤金額改變時才重算。
- 群組 `incomes` 與支出一樣有 `splits`（已確認），收入取 `splits[uid]`。

### 2.2 唯讀規則

同步帳目的**金額、幣別、日期、標題不能在個人帳本編輯**（要改請到群組改，下次同步會更新）。**分類與備註可以改**，改過的欄位記在 `source.edited`，之後同步不再覆寫該欄位。

### 2.3 同步時機與範圍

- **只同步正在看的月份**（群組頁也是依月份載入）：查詢條件是該月份範圍與 `createdAt >= linkedAt`。翻到沒同步過的月份才讀；同一次使用內記憶已同步的月份，另提供手動「重新整理」。
- 用一次性讀取（`getDocs`），不開長期監聽；先比對現有帳目，只寫有變動的（新增、更新、刪除）。
- **偵測被刪除的帳目**：個人帳本該月份中、來源是群組、但這次查詢結果沒有的帳目，逐筆檢查來源文件：已不存在，或日期已早於 `linkedAt` → 刪除；仍存在但日期移到別的月份 → 更新日期（id 不變，不會重複）。
- **無法讀取的群組**（本人已退出或群組已刪除）：該群組的已同步帳目自動轉為一般帳目（`detached: true`），帳本頁提示一次。

### 2.4 連結與取消連結

- 帳本頁列出「我加入的群組」，每個群組有開關。開啟時寫入 `linkedAt = 現在`。
- 取消連結要確認：**保留**（預設）是把該群組的帳目標記 `detached: true`，變成一般帳目，可編輯、不再同步；**一併刪除**是刪掉所有 `source.groupId` 相符的帳目。
- 之後重新連結，`linkedAt` 重設為當下；`detached` 的帳目若落在新範圍內且 id 相同，會被覆寫並重新接回（不會產生第二筆）。

### 2.5 成本控制

預估成本主要來自同步的讀取量（與已連結群組的當月帳目數成正比，目前六人規模遠低於免費額度）。控制方式見上節：以月份為範圍、節流、一次性讀取、先比對再寫、**不在父文件放彙總**（個人帳目數遠大於群組，月報表直接算當月帳目）。群組帳目目前沒有 `updatedAt`，所以第一版是讀整月再比對；若日後讀取量變大，再補 `updatedAt` 做增量同步（要改群組端程式，不列入第一版）。

## 3. 介面與流程

- **路由**：`/ledger`（底部導覽列「記帳」；月份切換、收支合計、帳目列表、連結群組入口）、`/ledger/new`、`/ledger/:id/edit`、`/ledger/stats`（分類占比、帳戶支出、收支趨勢）。
- **匯率頁預留介面**：`/ledger/new?amount=…&currency=…&rate=…&source=fx`，新增表單讀 query 自動帶入。匯率頁本身是後續子專案，此處只定這個約定。
- **重用**：`useExchangeRate`、`MonthPicker`、`CalculatorModal`、`DateTimeField`、`spendMethods`／`sumBySpendMethod`；表單與統計中綁定群組的部分要先抽成通用版本。程式放 `src/features/ledger/`。
- 同步帳目在列表中顯示「來自：群組名稱」標籤與鎖頭提示。

## 4. rules、測試、刪除

- **rules**：`transactions`、`settings/ledgerLinks` 僅本人可讀寫且為非訪客（用 `isMember()`）；驗證 `type`、`currency` 在 `CURRENCIES` 內、`amount` 與 `baseAmount` 為大於 0 且小於 1e12 的數字。補 `firestore-tests/ledger.rules.mjs`。
- **單元測試**（同步邏輯寫成純函式）：依消費時間與 `linkedAt` 篩選、分攤為 0 或贊助不產生、固定 id 的冪等性、群組帳目被刪除或日期移動後的更新與刪除、`edited` 欄位不被覆寫、幣別匯率凍結、取消連結保留與刪除、主要幣別已有帳目時不可改。
- **刪除我的資料**：`deleteMyData` 涵蓋 `transactions` 與 `settings/ledgerLinks`；`public/privacy.html`（中英文）補寫個人帳本資料。
- **文件**：新增 `docs/guides/personal-ledger.md`，更新 `README.md`、`docs/guides/data-model.md`。
- **與 P14 帳號合併**：`mergeAccounts` 搬移 `users/{dropUid}/…` 時必須包含 `transactions` 與 `settings/ledgerLinks`：帳目同 id 衝突以 `keepUid` 為準；`ledgerLinks` 兩邊的群組取聯集，同一群組取較早的 `linkedAt`。要確認 `functions/memberOps.js` 的搬移清單並補上。

## 風險

- 抽出通用表單與統計時不可破壞既有群組頁的行為，先確保現有測試通過再抽。
- 匯率來源（open.er-api.com）失敗時，記帳要能手動輸入匯率（`useExchangeRate` 已支援 `setManualRate`）。
- 同步由本人的前端執行，所以其他成員記帳後，要等本人下次開啟個人帳本才會看到；介面要有「重新整理」。
- 群組帳目的消費時間可被改到連結日之前，該筆會被視為超出範圍而刪除（見 2.3）；這是「以消費時間為準」的直接結果。
- 個人帳目沒有數量上限，查詢一律限月份範圍。

## 待決議

- **本地儲存**：目前 Firestore 沒有開本地快取。是否改用 `persistentLocalCache`（IndexedDB），或引入其他本地資料庫，另案討論，不阻擋本項；第一版的同步設計不依賴它。

## 不在本項範圍

預算（等 P8）、CSV 匯出、帳戶間轉帳、重複性記帳、匯率換算頁本身、P18 首頁摘要卡片、群組帳目的增量同步。
