# TODO

> 更新日期：2026-10-14。只列尚未完成的項目；已完成的功能（P0 共用基礎、P1 多國語言、P2 網頁版置中、P3 收入、P4 預算第一版）見 `README.md` 與 `docs/`。
> 狀態：`[ ]` 未開始　`[~]` 進行中

**每項完成時都要做**：`npm run lint`、`npm test`、`npm run build`；更新 `README.md` 功能清單與相關 `docs/`；涉及 rules 或 functions 的，**rules 與前端放在同一個 PR**（CI 推 `main` 就部署，新欄位沒有 rules 會在正式環境被拒絕）；rules 改動要有測試（`npm run test:rules`）並用兩個帳號實測（見 `docs/operations.md`）。

| # | 項目 | 狀態 |
|---|---|---|
| P5 | 更多收款碼 | [ ] |
| P6 | 訂閱方式評估（只評估不實作） | [ ] |
| — | 後續與已知小問題 | [ ] |

---

## P5 更多收款碼

現況：`PROVIDERS` 只有 4 種（`richart`、`jkopay`、`bank`、`custom`，`src/config/paymentProviders.js`）；每人沒有數量上限、沒有排序、沒有 QR 圖片欄位。

- [ ] **去耦合**：確認 `TransferPage` 的選單由收款人實際擁有的方式產生、比對用 `providerId`（P1 已改存 `providerId`，動工前先看現況還剩什麼）。
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

## 後續與已知小問題

**預算（第一版之後）**
- 分類預算：`budget.byCategory`，需要依分類的淨額；rules 的 `hasOnly` 要放寬；自訂分類只能比對文字。
- 每月：`period.type = 'monthly'`＋月初日；需要本月帳目加總；`StatsPage` 加期間選擇器與預算標記。
- 跨過 80%／100% 時用 `liff.sendMessages` 提醒（需避免重複提醒）。
- 開放修改基準幣時，要同步換算或清除 `budget`。

**網頁版**
- [ ] 鍵盤操作與滑鼠 hover 狀態。

**已知小問題**
- `memberExpenseCounts` 有寫入但 `src/` 找不到讀取者。
- 建立者「移除成員」是直接移除，被移除者的名字會顯示為「未知」，與「退出」保留訪客名字的行為不一致。
- 移除成員後 `memberBalances` 仍殘留其 key。
- `guestLogin` 沒有頻率限制。
- `GroupPage` 的 `expenses`、`settlements` 查詢沒有上限，帳目多時讀取量會成長。
- 官方帳號加好友：只有授權畫面才會出現，已授權的使用者不會再看到（目前以首頁與群組設定的「官方帳號」入口補足）。
