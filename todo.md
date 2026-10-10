# TODO：下一階段功能路線圖

> 建立日期：2026-10-10。檔案與行號是撰寫當下的位置，動工前請先重新確認。
> 狀態：`[ ]` 未開始　`[~]` 進行中　`[x]` 完成

## 0. 總覽

| # | 項目 | 狀態 | 說明 |
|---|---|---|---|
| P0 | 共用基礎（前置） | [x] | 收斂餘額重算、修已知落差，其他項目的地基（程式已完成，待提交與合併後冒煙測試） |
| P1 | 多國語言（繁中＋英文） | [ ] | 先建架構，英文先上；資料與顯示拆開 |
| P2 | 網頁版版型 | [ ] | 先做置中限寬的外殼，雙欄之後再說 |
| P3 | 收入（群組收入） | [x] | 退款、預收款、補貼；獨立子集合（程式已提交並部署，待畫面實測） |
| P4 | 預算（總預算＋分類預算） | [ ] | 建立者設定，記帳時顯示剩餘與超支 |
| P5 | 更多收款碼 | [ ] | 去耦合、QR 圖片、更多 provider、排序與上限 |
| P6 | 訂閱方式評估 | [ ] | 只評估不實作，輸出決策建議 |

**已確認的決策**
- 收入 = 群組收入（退款、預收款、補貼），**不做**個人記帳。
- 預算 = 群組總預算＋分類預算，不做每人預算。
- 語言 = 繁體中文＋英文，之後再擴充。

**建議順序：P0 → P1 → P2 → P3 → P4 → P5；P6 可隨時平行進行（純文件）。**
- P0 先收斂三份複製貼上的餘額重算，P3 的收入才不會在編輯／刪除時被漏算。
- P1 先做，P3、P4 的新畫面一開始就用 `t()` 寫，不必事後再抽字串；分類要先改成代碼，P4 才能穩定比對。
- P2 放在 P3 之前，新頁面直接長在新外殼裡。

**每項完成時都要做**：`npm run lint`、`npm test`、`npm run build`；更新 `README.md` 功能清單與相關 `docs/`；涉及 rules 或 functions 的，**rules 與前端放在同一個 PR**（CI 推 `main` 就部署，新子集合沒有 rules 會在正式環境被拒絕）；rules 改動要用兩個帳號實測（見 `docs/operations.md`）。

---

## P0 共用基礎（前置）

目的：現在餘額維護有兩套做法，新增用 `increment()`，編輯／刪除用完整重算，而且重算寫了三份，`SettlePage` 還自己再寫一份。不先收斂，收入與預算會到處漏算。

- [x] 新增 `src/utils/groupAggregates.js`：`recomputeGroupAggregates(groupId, members, { activity })`（計算拆成純函式 `computeGroupAggregates`，放在 `expenseHelpers.js` 以便測試），讀全部子集合後重算 `totalAmount`、`totalExpenses`、`memberBalances`、`memberExpenseCounts`。取代下列三處：
  - `src/pages/EditExpensePage.jsx:171`（`recomputeAndSaveBalances`）
  - `src/pages/GroupPage.jsx:105-115`（刪除支出）
  - `src/pages/GroupPage.jsx:126-135`（刪除轉帳，目前只重算 `memberBalances`）
- [x] `src/pages/SettlePage.jsx` 約 44-61 行自己算餘額，改用 `computeMemberBalances`（`src/utils/expenseHelpers.js`）。另外順手修了每人明細（`diff`）轉帳正負號相反的 bug。
- [x] 修 rules 與客戶端的長度落差：`firestore.rules` 的 `value.size()` 上限由 100 改為 200（App 類儲存前會 parse 成短值，實際落差只有自訂欄位的 101-200 字；`size()` 與 `maxLength` 同以 UTF-16 code unit 計數，已在模擬器實測）。
- [x] 清理過期文件：`docs/operations.md:71` 的首頁回填敘述、`:54` 的端點清單、`docs/architecture.md:10、13`。
- [x] 補測試（沿用 `src/utils/expenseHelpers.test.js` 的風格，純函式、不引入 React／Firebase）。

**驗證**：新增、編輯、刪除支出與轉帳後，各人餘額與總額與重構前一致；餘額總和為 0。

**風險**：重算是多筆非交易式寫入，現在就是這樣；本項不改這個行為，只收斂成一處。

---

## P1 多國語言（繁中＋英文）

現況：約 700 行含中文、分布在約 40 個檔案，全部寫死在 JSX；沒有 i18n 套件、沒有 `Intl`、沒有呼叫 `liff.getLanguage()`。字串最多的檔案：`GroupPage`（93）、`HomePage`（72）、`EditGroupPage`（56）、`ExpenseForm`（46）、`AppContext`（40）、`PaymentMethodsPage`（37）、`TransferPage`（34）。

### 架構
- [ ] 自建輕量 `I18nProvider` 與 `t(key, params)`，字典放 `src/i18n/zh-TW.js`、`src/i18n/en.js`。**不加套件**，避免多一個依賴；目前不需要複數規則。
- [ ] 語言判定順序：使用者手動選擇（localStorage）→ LINE 內 `liff.getLanguage()` → `navigator.language` → 預設 `zh-TW`。首頁設定氣泡加語言切換。
- [ ] `index.html` 的 `lang`、`<title>` 隨語言更新。

### 資料與顯示拆開（必須向下相容，舊資料不能壞）
- [ ] **分類**：`src/config/expenseForm.js:1` 的 `DEFAULT_CATEGORIES` 改成代碼（`food`、`transport`…）。讀取時把既有中文標籤對應到代碼；自訂分類維持原字串。`GroupPage`、`StatsPage` 的篩選與統計用代碼比對。
- [ ] **付款方式**：`settlements.paymentMethod` 現在存中文名稱（`TransferPage.jsx:18`）。改存 `providerId`，舊中文名稱讀取時對應（與 P5 一起做最省事）。
- [ ] **最新動態**：`lastActivity.text` 現在存整句中文。改存結構化 `{type, title}`，畫面依檢視者語言組句；舊資料以原文顯示。寫入點：`AddExpensePage`、`EditExpensePage`、`GroupPage`、`TransferPage`。
- [ ] CSV 標題、檔名後綴（`GroupPage`）依語言輸出。
- [ ] `bankCodes.json` 銀行名稱是台灣銀行，英文版維持原名即可。

### 格式與其他固定字串
- [ ] 日期、時間、金額改用 `Intl`（目前寫死 `toLocaleDateString('zh-TW')`、`toLocaleString()` 沒帶 locale）：`GroupPage`、`expenseHelpers.js`、`AddExpensePage`、`StatsPage` 等。
- [ ] 幣別名稱（`src/config/currencies.js`）加英文名。
- [ ] LINE Flex 訊息：`src/utils/shareContent.js`、`AddExpensePage`、`TransferPage` 依**發送者**語言輸出（收到的人可能語言不同，先接受）。
- [ ] `functions/index.js`：`sharePage` 的 OG 文字、`前成員` 預設名稱。HTTP 錯誤碼本來就是英文，由客戶端對應顯示。`sharePage` 先預設 zh-TW，必要時以 `Accept-Language` 判斷。
- [ ] `public/terms.html`、`public/privacy.html` 補英文版（或單頁雙語）。

### 抽字串順序
`GroupPage` → `HomePage` → `EditGroupPage` → `ExpenseForm` → `AppContext` → 其餘頁面與元件。

**驗證**：寫一個 grep 腳本確認 `src/**/*.jsx` 沒有殘留中文；兩種語言逐頁手動走一遍；LINE 內與外部瀏覽器各測一次；用舊資料（中文分類、中文付款方式、舊 `lastActivity`）確認顯示正常。

**風險**：資料拆開要做成「讀取時對應」，不要一次性遷移資料；英文字串較長，注意按鈕與窄欄位溢出（改名那列才剛修過）。

### 收尾：移除舊資料相容層（必做）
- [ ] 上線前清掉所有舊測試群組與紀錄（目前沒有正式使用者），確認資料庫已無中文分類、中文付款方式與只有 `text` 的 `lastActivity`。
- [ ] 刪除 `src/i18n/legacy.js` 的舊對照（`LEGACY_CATEGORY`、`LEGACY_PAYMENT`）、`WRITE_CODES` 開關、`describeActivity` 讀 `text` 的分支，以及對應測試。

---

## P2 網頁版版型

現況：全站 inline style、沒有 media query、沒有 `max-width`；`TabBar` 是 `fixed; left:0; right:0` 全寬；`StickyFooter` 寫死 50px 的 TabBar 高度；`InviteModal` 與 `GroupPage` 的轉帳詳情面板有 `maxWidth:480` 但沒有置中；`src/App.css` 是沒在用的 Vite 範本殘留。桌機打開時內容會撐滿整個視窗。

### 階段 1（必做、成本低）
- [ ] 新增 `AppShell`：寬度超過手機時內容置中、限寬（建議 480～560px），背景補色。
- [ ] 要能寫 media query：用 Tailwind 4（已安裝，目前只有 `LoadingScreen` 用到）或在 `src/index.css` 寫 class；inline style 做不到。
- [ ] `TabBar` 的內層限制在同樣寬度；`StickyFooter` 不再寫死 50px。
- [ ] `InviteModal`、`GroupPage` 詳情面板補水平置中（`CalculatorModal` 已正確，可當範本）。
- [ ] 統計頁圖表寬度、`HomePage` 空狀態等逐頁檢查。
- [ ] 刪除未使用的 `src/App.css`（先確認沒有被 import）。

### 階段 2（選做，階段 1 之後再評估）
- [ ] 桌機雙欄：左側群組列表、右側群組內容；統計頁改寬版版面。
- [ ] 鍵盤操作與滑鼠 hover 狀態。

**驗證**：瀏覽器寬度 360 / 768 / 1280 三種逐頁檢查；LINE 內不得退步（尤其底部導覽列與固定按鈕）。

**風險**：全站是 inline style，改動面廣；建議以外殼＋少量 class 為主，不一次改寫所有頁面。

---

## P3 收入（群組收入）

目的：退款、預收款、補貼這類「進到群組的錢」。**不可放進 `expenses`**，否則 `totalAmount`、`StatsPage`、`SettlePage`、`GroupPage` 的總額都會重複計算。

### 資料模型
`groups/{gid}/incomes/{iid}`：
```
title, category, currency, originalAmount, exchangeRate,
amount          // 基準幣
received: {uid: amt}   // 誰收到錢（類似 payments）
splits:   {uid: amt}   // 誰受益（類似 splits）
createdBy, createdAt, hasTime, addedAt, note?
```
群組新增欄位：`totalIncome`、`incomeCount`；`totalAmount` 維持純支出，畫面可另外顯示淨支出。

### 記帳語意
收入是「反向的支出」：`balance[uid] += splits[uid] - received[uid]`，總和仍為 0。
範例：飯店退款 1000 由 A 收到、A 與 B 均分 → A −500（A 要把錢交出來）、B +500。
可重用 `computeSplits`、`applyExchangeRate`、`buildPayments`（`src/utils/expenseHelpers.js`）。

### 要動的地方
- [x] `expenseHelpers.js`：`computeMemberBalances` 加收入參數；補純函式與測試。
- [x] P0 的 `recomputeGroupAggregates` 納入 `incomes`。
- [x] 新增收入頁與編輯頁、路由（`src/App.jsx` 約 100-107 行）；可共用 `ExpenseForm`，加 `kind` 旗標。
- [x] `GroupPage`：第三個 `onSnapshot`、時間軸加 `_type:'income'`（顏色與支出、轉帳區分）、詳情面板與刪除。
- [x] `AddExpensePage` 的新增入口：加「支出／收入」選擇。
- [x] `StatsPage`：收入與支出對照。
- [x] CSV 匯出加類型欄。
- [x] `firestore.rules`：新增 `incomes/{id}` 的 `match`（比照 `expenses`，`isMemberOf`）。
- [x] `functions/index.js` 的 `migrateMember`（約 181 行）加 `incomes`：`received`、`splits`、`shares`、`createdBy`（`detachFromGroup`、`claimMember` 都靠它）。
- [x] `src/utils/deleteMyData.js` 約 25-26 行與 `src/pages/EditGroupPage.jsx` 約 181-182 行的手動刪除清單加 `incomes`（`deleteGroupCompletely` 用 `recursiveDelete`，不用改）。
- [x] 文件：`docs/operations.md` 的「分帳計算」補收入規則。

### 測試
- 收入後餘額總和為 0、退款範例、多幣別換算。
- `migrateMember` 轉移後帳目一致，可沿用先前的 Firestore 模擬器測法。

**風險**：新增走 `increment()`、編輯與刪除走完整重算，兩條路徑都要處理收入，且結果必須一致；舊群組沒有 `incomes` 要能正常運作。

---

## P4 預算（總預算＋分類預算）

### 資料模型
`groups/{gid}.budget`：
```
{ amount, period: { type: 'trip' | 'monthly', start?, end? },
  byCategory: { [分類代碼]: amount }, warnAt: 0.8, net: true }
```
`net` 表示以「支出扣除收入」計算。金額單位為群組 `baseCurrency`；支出的 `amount` 已是基準幣，不需再換算。

### 要動的地方
- [ ] `firestore.rules`：群組 update 第一分支（約 70-100 行）目前任何成員都能改任何欄位（除 `createdBy`），預算要限建立者，需補檢查。
- [ ] 新增 `src/utils/budget.js`：純函式 `computeBudgetStatus(budget, expenses, incomes, now)`，含期間過濾與分類比對；補測試（期間邊界、分類沒設預算、扣除收入、自訂分類）。
- [ ] `EditGroupPage`：預算設定區塊（限建立者）。
- [ ] `GroupPage` 標頭：總預算進度條。
- [ ] `ExpenseForm` / `AddExpensePage`：選分類時顯示剩餘額度，超支給提示（**不阻擋**儲存）。
- [ ] `StatsPage`：加期間選擇器（目前沒有期間概念），分類長條加預算標記。
- [ ] `HomePage` 群組卡片：超支徽章。
- [ ] 之後再考慮：跨過 80%／100% 時用 `liff.sendMessages` 提醒（先不做）。

**依賴**：P1（分類代碼）、P3（淨額）。
**風險**：自訂分類是自由文字，預算只對預設分類穩定；期間為「整趟旅行」時需決定起訖日的來源。

---

## P5 更多收款碼

現況：`PROVIDERS` 只有 4 種（`richart`、`jkopay`、`bank`、`custom`，`src/config/paymentProviders.js`）；每人沒有數量上限、沒有排序、沒有 QR 圖片欄位；`TransferPage.jsx:18` 的 `PAYMENT_METHODS` 寫死，且以顯示名稱比對收款人的方式，`providerId` 其實沒被用到。

- [ ] **去耦合**：`TransferPage` 的選單改由收款人實際擁有的方式產生；比對改用 `providerId`；`settlements` 一併存 `providerId`（舊資料以名稱相容，與 P1 一起做）。
- [ ] **新增 provider**：
  - [ ] QR 圖片（通用，涵蓋沒有穩定連結的錢包）。
  - [ ] PayPal.me 等連結型。
  - [ ] LINE Pay、台灣 Pay、悠遊付等：先確認連結格式（`docs/payment-methods.md` 寫明連結格式未知前不支援），沒有穩定 deep link 的先歸入 QR 圖片或自訂。
  - [ ] 其他地區：`REGIONS` 加項目，選單 UI 已存在（目前只有一個地區所以隱藏）。
  - 每個 provider 要有 `parse`、`openUrl`、`validate`，並補 `paymentProviders.test.js`。
- [ ] **QR 圖片**：
  - 欄位 `qrPath`；Storage 路徑 `users/{uid}/paymentMethods/{methodId}/…`；`storage.rules` 用 `firestore.get` 判斷該筆 `isPublic`。
  - 上傳重用 `CropModal`（比例 1）與 `browser-image-compression`。
  - `PaymentMethodBody` 顯示圖片並提示長按儲存。
- [ ] **數量上限**（建議 10）：rules 無法計數，先做客戶端軟上限；要硬限制就改成 Cloud Function 新增。
- [ ] **排序與預設**：新增 `order` 欄位與調整順序的介面；可選「預設」標記。
- [ ] **rules**：補 `providerId`、`customName`、`label`、`bankCode` 的驗證（目前只驗 `value`、`isPublic`）。
- [ ] 更新 `docs/payment-methods.md`。

**驗證**：兩個帳號互相檢視公開與不公開的 QR；`firestore.rules`、`storage.rules` 雙帳號實測。

**風險**：QR 圖片是公開給所有登入者看的敏感資料；訪客不能新增（現況）；Storage 沒有每人配額，要留意濫用。

---

## P6 訂閱方式評估（只評估，不實作）

**現況**
- `public/terms.html` 寫「目前免費使用」，規劃自願捐款；`public/privacy.html` 承諾無廣告、無資料販售、無追蹤。
- 程式沒有方案、配額概念，限制都是固定常數：`MAX_MEMBERS=50`、`MAX_GUEST_NAMES=3`、`MAX_CSV_CHARS`。
- 成本主要在：Firestore 讀取（`GroupPage` 的 `onSnapshot` 沒有上限）、Storage（收據、封面，沒有每人配額）、Functions（`sharePage` 每次開分享連結都會跑）。Functions 在 Blaze 方案、`maxInstances:5`；設 `minInstances` 會增加最低帳單且 CI 無法互動確認。

**模式比較**

| 模式 | 優點 | 缺點 |
|---|---|---|
| 自願捐款 | 不改產品、符合現行條款 | 收入不穩定 |
| 群組 Pro（建立者付費） | 價值在群組，不是個人；付費者明確 | 要做群組層級的功能閘門 |
| 個人 Pro | 容易理解 | 群組成員多半不付費，轉換率低 |
| 一次性解鎖 | 金流簡單 | 沒有經常性收入，難覆蓋持續成本 |

**初步傾向**：核心維持免費，**以「群組」計價**。可付費的功能候選：預算提醒、收據 OCR、更多收款碼、更大群組、完整匯出。

**技術前提（若要做）**
- 方案資料放 `groups/{gid}.plan` 或 `users/{uid}/plan`，**只能由 Cloud Function 透過金流 webhook 寫入**，rules 禁止客戶端寫。
- 現有限制常數改為可依方案調整；功能閘門要同時在 rules 與 UI 判斷。

**金流與法遵（需另行確認）**
- LINE 內是網頁 App，LIFF 內付款的平台規範要先確認。
- 候選：Stripe Billing、綠界定期定額、TapPay。
- 統一發票與營業登記、消費者保護法（退款、試用）、條款與隱私政策更新。

**決策前先量的數字**：MAU、每位使用者的 Firebase 成本、付費轉換率假設。

- [ ] 蒐集目前用量與成本（Firebase 用量頁、預算警示）。
- [ ] 確認 LIFF 內付款規範與可用金流。
- [ ] 產出決策結論（做／不做、模式、定價區間），另存為 `docs/monetization.md`。

---

## 已知小問題（不在上述項目內，順手記錄）

- `memberExpenseCounts` 有寫入但 `src/` 找不到讀取者。
- 建立者「移除成員」是直接移除，被移除者的名字會顯示為「未知」，與「退出」保留訪客名字的行為不一致。
- 移除成員後 `memberBalances` 仍殘留其 key。
- `guestLogin` 沒有頻率限制。
- `GroupPage` 的 `expenses`、`settlements` 查詢沒有上限，帳目多時讀取量會成長。
- 官方帳號加好友：只有授權畫面才會出現，已授權的使用者不會再看到（目前以首頁與群組設定的「官方帳號」入口補足）。
