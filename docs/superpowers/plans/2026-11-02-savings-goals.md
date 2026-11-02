# 儲蓄目標 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 LINE 使用者在首頁頭像選單進入「儲蓄目標」，建立多個個人目標、記錄存款／提款並查看進度與明細。

**Architecture:** 資料放在 `users/{uid}/savingsGoals/{goalId}` 與其子集合 `entries`；已存金額不落地，由前端監聽 `entries` 後加總。純計算放 `src/utils/savings.js`（`node --test`），Firestore 存取與監聽各收進一個 util／hook，四個頁面與一個紀錄彈窗只負責畫面。

**Tech Stack:** React 19、react-router-dom、Firebase Firestore、lucide-react、`node --test`、`@firebase/rules-unit-testing`。

**Spec:** `docs/superpowers/specs/2026-11-02-savings-goals-design.md`

## Global Constraints

- 只有 LINE 使用者可用：訪客在選單不顯示入口、路由 `<Navigate to="/" />`、rules 用 `isLineUser()`。
- 路由：`/savings`、`/savings/new`、`/savings/:goalId`、`/savings/:goalId/entries`。編輯目標用 `/savings/:goalId/edit`（見 Task 5）。
- 目標貨幣取自 `CURRENCIES`（`src/config/currencies.js`），建立後不可改；不做匯率換算。
- 提款不設限：餘額可為負；存款可超過目標；進度夾在 0～1。
- `targetDate` 選填，格式 `YYYY-MM-DD` 或 `null`；紀錄 `amount` 一律存正數。
- 金額顯示沿用專案現況：`getCurrency(code).symbol` + `useI18n().fmt.num(n)`（`format.js` 沒有幣別格式化，spec 的描述已更正）。
- 所有可見文字走 `t()`，zh-TW 與 en 兩份字典 key 與佔位符必須一致；程式裡不得出現寫死的中文字串（`npm run check:cjk` 會掃）。
- 樣式沿用 `PaymentMethodsPage.jsx` 的 header（`cs-header`、`PawDecor`、`‹` 返回鈕）、`cs-body`、卡片與色票，行內 style，不新增 CSS 檔。
- commit 由使用者自己下，計畫中的 Checkpoint 步驟只是停下來列出已改檔案。

## Review Focus

- 提款超過餘額：`sumSaved` 為負、`progressRatio` 為 0，畫面不得出現負寬度進度條（Task 1 測試）。
- 存款超過目標：`progressRatio` 為 1，頁面顯示「已達成」而非 120%（Task 1 測試、Task 6 畫面）。
- 小數相加：`0.1 + 0.2` 加總必須是 `0.3`，不顯示 `0.30000000000000004`（Task 1 測試）。
- 目標日期是今天或已過：`daysLeft` 為 `0`／負數，頁面分別顯示「今天到期」與「已逾期」（Task 1 測試）。
- 目標金額或紀錄金額輸入 `0`、負數、空白、非數字：表單擋下、rules 也拒絕（Task 2 rules 測試、Task 5／6 驗證）。
- 他人與訪客讀寫：別人不能讀寫、訪客 token 不能寫（Task 2 rules 測試）。
- 刪除目標中途失敗：先刪 `entries` 再刪目標，重試仍能完成，不留下找不到父層的孤兒紀錄（Task 3）。

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `src/utils/savings.js`（新） | 純函式：`sumSaved`、`progressRatio`、`daysLeft` |
| `src/utils/savings.test.js`（新） | 上述純函式測試 |
| `src/utils/savingsData.js`（新） | `deleteSavingsGoal`、`deleteAllSavings`（Firestore 刪除） |
| `src/hooks/useSavingsEntries.js`（新） | 監聽某目標的 `entries`，回傳 `entries \| null` |
| `src/components/SavingsEntryModal.jsx`（新） | 新增／編輯一筆紀錄的彈窗 |
| `src/pages/SavingsListPage.jsx`（新） | `/savings` 目標列表 |
| `src/pages/SavingsGoalFormPage.jsx`（新） | `/savings/new` 與 `/savings/:goalId/edit` |
| `src/pages/SavingsGoalPage.jsx`（新） | `/savings/:goalId` 儲蓄頁 |
| `src/pages/SavingsEntriesPage.jsx`（新） | `/savings/:goalId/entries` 明細頁 |
| `firestore-tests/savings.rules.mjs`（新） | rules 測試 |
| `firestore.rules`、`src/App.jsx`、`src/pages/HomePage.jsx`、`src/utils/deleteMyData.js`、`src/i18n/zh-TW.js`、`src/i18n/en.js`、`README.md`（改） | 見各 Task |
| `docs/savings-goals.md`（新） | 功能說明 |

---

### Task 1: 純計算 `savings.js`

**Files:**
- Create: `src/utils/savings.js`
- Test: `src/utils/savings.test.js`（風格同 `src/utils/budget.test.js`：`node:test` + `node:assert/strict`）

**Interfaces:**
- Produces:
  - `sumSaved(entries: {type: 'save'|'withdraw', amount: number}[]): number` — 存款加總減提款加總，四捨五入到小數 2 位。
  - `progressRatio(saved: number, target: number): number` — `clamp(saved / target, 0, 1)`；`target <= 0` 回傳 0。
  - `daysLeft(targetDate: string | null, today: string): number | null` — 兩個 `YYYY-MM-DD` 的日數差（目標 − 今天）；`targetDate` 為空回傳 `null`。

- [ ] **Step 1: 寫失敗測試**，測試名稱與斷言：
  - `sumSaved 存款減提款`：`[{save,100},{withdraw,30}]` → `70`
  - `sumSaved 提款超過存款為負`：`[{save,100},{withdraw,150}]` → `-50`
  - `sumSaved 小數不累積誤差`：`[{save,0.1},{save,0.2}]` → `0.3`
  - `sumSaved 空陣列為 0`
  - `progressRatio 一半`：`(50,100)` → `0.5`
  - `progressRatio 超過目標夾在 1`：`(120,100)` → `1`
  - `progressRatio 負餘額夾在 0`：`(-50,100)` → `0`
  - `progressRatio 目標為 0 回傳 0`：`(10,0)` → `0`
  - `daysLeft 未來／今天／過期／無日期`：`('2026-11-12','2026-11-02')` → `10`；同日 → `0`；`('2026-11-01','2026-11-02')` → `-1`；`(null,'2026-11-02')` → `null`；跨月 `('2026-12-01','2026-11-30')` → `1`
- [ ] **Step 2: 執行確認失敗**：`node --test src/utils/savings.test.js`，預期 FAIL（找不到模組）。
- [ ] **Step 3: 實作上述三個函式於 `src/utils/savings.js`**。`daysLeft` 用 `Date.UTC` 解析兩個字串再相減除以 86400000，避免時區與夏令時間誤差。
- [ ] **Step 4: 執行確認通過**：`node --test src/utils/savings.test.js`，預期全部 PASS。
- [ ] **Step 5: Checkpoint**：列出 `src/utils/savings.js`、`src/utils/savings.test.js`，請使用者 commit。

---

### Task 2: Firestore rules 與 rules 測試

**Files:**
- Modify: `firestore.rules`（接在 `paymentMethods` 區塊之後，約第 61 行）
- Create: `firestore-tests/savings.rules.mjs`（風格同 `nickname.rules.mjs`，`projectId: 'demo-catsplit-savings'`）

**Interfaces:**
- Produces（文件形狀，後續 Task 皆依此）：
  - `users/{uid}/savingsGoals/{goalId}`：`{ title: string, targetAmount: number, currency: string, targetDate: string|null, createdAt: timestamp }`
  - `users/{uid}/savingsGoals/{goalId}/entries/{entryId}`：`{ type: 'save'|'withdraw', amount: number, title: string, date: string, createdAt: timestamp }`

- [ ] **Step 1: 寫失敗測試**（先不改 rules），測試名稱與斷言：
  - `本人可建立、讀取、更新、刪除目標`（`assertSucceeds`）
  - `別人不能讀寫我的目標與紀錄`、`未登入不能讀`（`assertFails`）
  - `訪客 token 不能寫目標與紀錄`：`dbAs('u1', { guest: true })`
  - `目標驗證`：`title` 空字串或超過 50 字、`targetAmount` 為 `0`／負數／字串／`>= 1e12`、`currency` 非字串，皆 `assertFails`；`targetDate` 為 `null` 與 `'2026-12-31'` 皆 `assertSucceeds`
  - `紀錄驗證`：`type` 非 `save`／`withdraw`、`amount` 為 `0`／負數／字串／`>= 1e12`、`title` 超過 100 字（空字串允許）、`date` 非字串，皆 `assertFails`；合法的 `save` 與 `withdraw` 各一筆 `assertSucceeds`
- [ ] **Step 2: 執行確認失敗**：`npm run test:rules`，預期「本人可建立…」FAIL（預設拒絕）。
- [ ] **Step 3: 在 `firestore.rules` 新增兩個 match 區塊** `users/{userId}/savingsGoals/{goalId}` 與其下 `entries/{entryId}`。`read`：`request.auth != null && request.auth.uid == userId`；`create, update`：`isLineUser() && request.auth.uid == userId` 並加上 Task 2 Interfaces 與 Step 1 的欄位驗證；`delete`：`isLineUser() && request.auth.uid == userId`。金額上限沿用 `budget` 的 `< 1000000000000`。
- [ ] **Step 4: 執行確認通過**：`npm run test:rules`，預期新舊測試全部 PASS（需 Java 與 Firestore emulator，會占用 8080 埠）。
- [ ] **Step 5: Checkpoint**：列出 `firestore.rules`、`firestore-tests/savings.rules.mjs`。

---

### Task 3: 資料存取（刪除、監聽）與 `deleteMyData`

**Files:**
- Create: `src/utils/savingsData.js`、`src/hooks/useSavingsEntries.js`
- Modify: `src/utils/deleteMyData.js:61-73`

**Interfaces:**
- Produces:
  - `deleteSavingsGoal(uid: string, goalId: string): Promise<void>` — 先用 `getDocs` 讀 `entries` 並以 `writeBatch` 刪光，再 `deleteDoc` 目標。
  - `deleteAllSavings(uid: string): Promise<void>` — 讀 `savingsGoals`，對每個目標呼叫 `deleteSavingsGoal`。
  - `useSavingsEntries(uid: string, goalId: string): entries | null` — `onSnapshot` 監聽 `users/{uid}/savingsGoals/{goalId}/entries`，回傳 `{ id, ...data }[]`，載入前為 `null`，錯誤時 `console.error` 並回 `[]`（做法同 `PaymentMethodsPage.jsx:46-55`）。排序不在 hook 內處理。
- Consumes: Task 2 的文件形狀。

- [ ] **Step 1: 實作 `savingsData.js`**。批次刪除超過 500 筆時要分批（`writeBatch` 上限 500 筆操作），個人紀錄雖少仍需處理。
- [ ] **Step 2: 實作 `useSavingsEntries.js`**，依賴陣列為 `[uid, goalId]`。
- [ ] **Step 3: 修改 `deleteMyData`**：在 `deleteMyPaymentMethods(uid)` 之後呼叫 `deleteAllSavings(uid)`，並更新該函式上方註解說明順序原因（要用登入身分才刪得掉，維持在 `detachFromGroups` 之前）。
- [ ] **Step 4: 驗證**：`npm run lint` 無錯誤；`npm test` 全部 PASS（`deleteMyData` 既有測試不受影響）。
- [ ] **Step 5: Checkpoint**：列出三個檔案。

---

### Task 4: 入口、路由與目標列表

**Files:**
- Create: `src/pages/SavingsListPage.jsx`
- Modify: `src/App.jsx:24`（lazy import）、`src/App.jsx:129`（新增路由）、`src/pages/HomePage.jsx:339`（選單項目）、`src/i18n/zh-TW.js`、`src/i18n/en.js`

**Interfaces:**
- Consumes: `useSavingsEntries`、`sumSaved`、`progressRatio`。
- Produces:
  - `ProgressBar({ ratio: number }): JSX`：自 `SavingsListPage.jsx` 具名匯出，Task 6 重用。
  - i18n key：`home.menu.savings`、`savings.title`、`savings.add`、`savings.empty`、`savings.back`、`savings.achieved`（zh：儲蓄目標／＋ 新增目標／還沒有儲蓄目標，建立一個開始存吧／返回／已達成）。en 對應英文。

- [ ] **Step 1: 字典與選單**：兩份字典補上述 key；`HomePage.jsx` 選單在「收款方式」之後加 `{ Icon: PiggyBank, label: t('home.menu.savings'), onClick: () => navigate('/savings') }`，同樣包在 `!user?.guest` 條件內（`PiggyBank` 來自 `lucide-react`）。
- [ ] **Step 2: 路由**：`App.jsx` 加入五條路由的 lazy import 與 `<Route>`（`/savings`、`/savings/new`、`/savings/:goalId/edit`、`/savings/:goalId`、`/savings/:goalId/entries`），全部 `user.guest ? <Navigate to="/" /> : <…/>`。後三個與 `/savings/new` 的元件在 Task 5～7 才存在，本 Task 只註冊 `/savings`，其餘路由隨各 Task 新增，避免引用不存在的檔案。
- [ ] **Step 3: 實作 `SavingsListPage`**：header 同 `PaymentMethodsPage`，返回回 `/`；`onSnapshot` 監聽 `users/{uid}/savingsGoals` 依 `createdAt` 由新到舊；每張目標卡片是一個子元件，內部用 `useSavingsEntries` 算 `saved`，顯示標題、`{symbol} {fmt.num(saved)} / {fmt.num(targetAmount)}`、`ProgressBar`，`saved >= targetAmount` 時加 `t('savings.achieved')`；點卡片 `navigate('/savings/' + id)`；右上角按鈕導向 `/savings/new`。載入中顯示 `common.loading`，無資料顯示 `savings.empty`。
- [ ] **Step 4: 驗證**：`npm test`（含 i18n 字典一致性）PASS；`npm run check:cjk` 回報 `TOTAL 0`；`npm run lint` 無錯誤。
- [ ] **Step 5: 手動驗證**：`npm run emulators` 與 `npm run dev`，登入後頭像選單出現「儲蓄目標」並進得去，空狀態文字正確。
- [ ] **Step 6: Checkpoint**：列出本 Task 改動檔案。

---

### Task 5: 建立／編輯目標

**Files:**
- Create: `src/pages/SavingsGoalFormPage.jsx`
- Modify: `src/App.jsx`（加 `/savings/new`、`/savings/:goalId/edit` 路由）、兩份字典

**Interfaces:**
- Produces: i18n key `savings.form.newTitle`、`savings.form.editTitle`、`savings.form.title`、`savings.form.target`、`savings.form.currency`、`savings.form.targetDate`、`savings.form.optional`、`savings.form.currencyLocked`、`savings.err.title`、`savings.err.amount`、`savings.saveFailed`。

- [ ] **Step 1: 實作頁面**：路由有 `:goalId` 時為編輯模式，先 `getDoc` 載入；欄位為標題（`maxLength=50`）、目標金額、貨幣（`<select>` 列 `CURRENCIES`，用 `t(c.labelKey)`）、目標日期（原生 `<input type="date">`，選填，可清空；不用 `DateTimeField`，它含時間）。編輯模式貨幣欄位 `disabled` 並顯示 `savings.form.currencyLocked`。
- [ ] **Step 2: 驗證與儲存**：標題 `trim()` 後為空 → `savings.err.title`；金額須為有限數且 `> 0` 且 `< 1e12` → 否則 `savings.err.amount`。新增用 `addDoc(…, { …, createdAt: serverTimestamp() })`，編輯用 `updateDoc`（不改 `currency`、`createdAt`）；`targetDate` 空值存 `null`。成功後新增導向 `/savings/{新 id}`，編輯回 `/savings/{goalId}`；失敗 `alert(t('savings.saveFailed'))` 並 `console.error`（同 `PaymentMethodsPage` 風格）。
- [ ] **Step 3: 驗證**：`npm test`、`npm run check:cjk`、`npm run lint` 皆通過。
- [ ] **Step 4: 手動驗證**：建立 TWD 與 JPY 各一個目標；金額填 `0`、`-5`、空白、`abc` 皆被擋並顯示錯誤；目標日期留空與填入皆能儲存；編輯時貨幣無法更改。
- [ ] **Step 5: Checkpoint**：列出本 Task 改動檔案。

---

### Task 6: 儲蓄頁與新增紀錄

**Files:**
- Create: `src/pages/SavingsGoalPage.jsx`、`src/components/SavingsEntryModal.jsx`
- Modify: `src/App.jsx`（加 `/savings/:goalId`）、兩份字典

**Interfaces:**
- Consumes: `useSavingsEntries`、`sumSaved`、`progressRatio`、`daysLeft`、`deleteSavingsGoal`、`ProgressBar`（Task 4）、`todayStr`（`src/utils/expenseHelpers.js`）。
- Produces:
  - `SavingsEntryModal({ entry, onClose, onSubmit }): JSX` — `entry` 為既有紀錄（編輯）或 `null`（新增）；欄位：類型（存款／提款切換，預設存款）、金額、標題（選填，`maxLength=100`）、日期（原生 date，預設 `todayStr()`）；驗證金額為有限數、`> 0`、`< 1e12`；呼叫 `onSubmit({ type, amount, title, date })`，由呼叫端寫入 Firestore。Task 7 重用。
  - i18n key：`savings.save`、`savings.withdraw`、`savings.saved`、`savings.progress`（`{pct}%`）、`savings.daysLeft`（`剩餘 {n} 天`）、`savings.dueToday`、`savings.overdue`、`savings.noDate`、`savings.addEntry`、`savings.editEntry`、`savings.entries`（明細）、`savings.entry.amount`、`savings.entry.title`、`savings.entry.date`、`savings.entry.type`、`savings.confirmDeleteGoal`（`確定要刪除「{name}」及其所有紀錄嗎？`）、`savings.deleteFailed`。

- [ ] **Step 1: 實作 `SavingsEntryModal`**（彈窗樣式參考 `PaymentMethodModal.jsx` 的遮罩與卡片）。
- [ ] **Step 2: 實作 `SavingsGoalPage`**：`onSnapshot` 監聽目標文件（不存在則導回 `/savings`）；顯示標題、`{symbol} {fmt.num(saved)} / {fmt.num(targetAmount)}`、`ProgressBar`、百分比（`Math.floor(ratio*100)`）、`saved >= targetAmount` 顯示「已達成」；目標日期：`daysLeft` 為 `null` 顯示 `savings.noDate`，`> 0` 顯示 `savings.daysLeft`，`=== 0` 顯示 `savings.dueToday`，`< 0` 顯示 `savings.overdue`（今天用 `todayStr()`）。按鈕：「新增紀錄」開彈窗，送出以 `addDoc(entries, { …, createdAt: serverTimestamp() })`；「明細」導向 `/savings/:goalId/entries`；編輯導向 `/savings/:goalId/edit`；刪除用 `confirm(t('savings.confirmDeleteGoal', { name }))` 後呼叫 `deleteSavingsGoal`，失敗 `alert(t('savings.deleteFailed'))`，成功導向 `/savings`。頁面不列紀錄。
- [ ] **Step 3: 驗證**：`npm test`、`npm run check:cjk`、`npm run lint` 皆通過。
- [ ] **Step 4: 手動驗證**：存 100、提 30，已存顯示 70；提款 200 後已存為負，進度條寬度為 0 且不破版；存到超過目標，進度條 100% 並顯示「已達成」；目標日期設為今天、昨天、下週，三種文字正確；刪除目標後回列表且該目標消失。
- [ ] **Step 5: Checkpoint**：列出本 Task 改動檔案。

---

### Task 7: 明細頁

**Files:**
- Create: `src/pages/SavingsEntriesPage.jsx`
- Modify: `src/App.jsx`（加 `/savings/:goalId/entries`）、兩份字典

**Interfaces:**
- Consumes: `useSavingsEntries`、`SavingsEntryModal`、`sumSaved`。
- Produces: i18n key `savings.entries.empty`、`savings.confirmDeleteEntry`（`確定要刪除這筆紀錄嗎？`）。

- [ ] **Step 1: 實作頁面**：header 返回到 `/savings/:goalId`；先 `getDoc` 目標取得 `currency` 與標題；紀錄依 `date` 由新到舊、同日依 `createdAt` 由新到舊排序；每列顯示日期（`fmt.shortDate`）、標題（空則顯示類型文字）、金額（存款綠色 `+`、提款紅色 `−`，用 `symbol` + `fmt.num`），列尾編輯（開 `SavingsEntryModal`，`updateDoc`）與刪除（`confirm` 後 `deleteDoc`）圖示鈕；頂部顯示目前已存金額。無紀錄顯示 `savings.entries.empty`。
- [ ] **Step 2: 驗證**：`npm test`、`npm run check:cjk`、`npm run lint` 皆通過。
- [ ] **Step 3: 手動驗證**：新增數筆跨日期紀錄，排序正確；編輯金額與類型後，儲蓄頁進度同步更新；刪除一筆後已存金額扣回；存款綠、提款紅。
- [ ] **Step 4: Checkpoint**：列出本 Task 改動檔案。

---

### Task 8: 文件與整體驗證

**Files:**
- Create: `docs/savings-goals.md`
- Modify: `README.md`（「功能」章節補一條、「文件」清單補一行）、`docs/superpowers/specs/2026-11-02-savings-goals-design.md`（兩處更正，見 Step 2）

- [ ] **Step 1: 寫 `docs/savings-goals.md`**：功能說明、資料結構（兩層集合與欄位）、rules 規則、刪除流程（先 `entries` 後目標）、不做的事。內容取自 spec，不重述實作細節。
- [ ] **Step 2: 更正 spec**：把「vitest」改為「`node --test`」；把「沿用 `format.js` 現有的幣別格式」改為「沿用 `getCurrency(code).symbol` 加 `fmt.num`」。
- [ ] **Step 3: 全套驗證**，皆需通過：
  - `npm run lint` 無錯誤
  - `npm test` 全部 PASS
  - `npm run check:cjk` 為 `TOTAL 0`
  - `npm run test:rules` 全部 PASS
  - `npm run build` 成功
- [ ] **Step 4: 端到端手動驗證**（emulator）：建立目標 → 存／提 → 看明細 → 編輯／刪除紀錄 → 刪除目標；到「設定」按「刪除我的資料」後，Firestore 模擬器裡 `users/{uid}/savingsGoals` 已清空；以訪客身分進 `/savings` 會被導回首頁。
- [ ] **Step 5: Checkpoint**：列出全部改動檔案，請使用者檢視後自行 commit。
