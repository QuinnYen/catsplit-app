# TODO

> 更新日期：2026-11-01。只列尚未完成的項目；已完成的功能（P0 共用基礎、P1 多國語言、P2 網頁版置中、P3 收入、P4 預算第一版）見 `README.md` 與 `docs/`。
> 狀態：`[ ]` 未開始　`[~]` 進行中

**每項完成時都要做**：`npm run lint`、`npm test`、`npm run build`；更新 `README.md` 功能清單與相關 `docs/`；涉及 rules 或 functions 的，**rules 與前端放在同一個 PR**（CI 推 `main` 就部署，新欄位沒有 rules 會在正式環境被拒絕）；rules 改動要有測試（`npm run test:rules`）並用兩個帳號實測（見 `docs/operations.md`）。

| # | 項目 | 狀態 |
|---|---|---|
| P5 | 更多收款碼 | [ ] |
| P6 | 訂閱方式評估（只評估不實作） | [ ] |
| P7 | 逐項分帳 | [ ] |
| P8 | 分類預算 | [ ] |
| P9 | 重複性支出 | [ ] |
| P10 | 統計趨勢範圍 | [x] |
| P11 | CSV 匯出美化 | [x] |
| P12 | 個人記帳 | [ ] |
| P13 | 群組頁改版：導覽列與搜尋 | [x] |
| P14 | 獨立帳號：多種登入方式與帳號綁定 | [ ] |
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

## P7 逐項分帳

現況：一筆支出只能選一種分帳方式（均分、部分均分、份數、百分比、自訂金額），整筆套同一個比例；`splits` 是每人分攤金額的 map。

- [ ] 支出新增「品項」：每項有名稱、金額、分攤對象（可多人）；各項分攤加總後寫入 `splits`，讓 `computeGroupAggregates`、結算、統計不用改。
- [ ] 品項明細要不要存進支出文件（`items`）：存了才能編輯與顯示，但要補 rules 驗證與 `EditExpensePage` 還原。
- [ ] 稅金與服務費：按各人品項小計比例分攤，或平均分，需決定預設。
- [ ] 外幣：品項金額在原幣別，換算沿用 `applyExchangeRate`（尾差歸最大出資者）。
- [ ] 與收據照片的關係：先只做手動輸入，OCR 另議（`P6` 的功能候選）。
- [ ] 補單元測試（`expenseHelpers`）。

**風險**：新增表單已經很長，UI 要避免讓一般均分變得更難操作；品項金額加總與總額不一致時的處理。

---

## P8 分類預算

由原本「後續與已知小問題」的預算項目移出。現況：預算只有整個群組一個 `budget = { amount, period: { type: 'trip' } }`，`validBudget()` 的註解已預留 `byCategory`。

- [ ] `budget.byCategory`：分類代碼對上限金額；需要依分類的淨額（支出 − 收入）。
- [ ] rules：`validBudget()` 的 `hasOnly` 放寬，驗證 `byCategory` 為 map、值為合理數字；補 `firestore-tests`。
- [ ] 自訂分類只能比對文字；與內建分類代碼的對應見 `docs/i18n.md`。
- [ ] 群組設定頁、群組頁進度條、記帳頁提示、首頁徽章要決定顯示哪一層（整體或各分類）。
- [ ] 更新 `docs/operations.md` 的預算說明。

---

## P9 重複性支出

- [ ] 決定觸發方式：Cloud Scheduler 加 Function 定時建立，或使用者打開 App 時補建（較便宜，但沒人開就不會產生）。
- [ ] 資料結構：群組下的重複規則（標題、金額、付款與分攤、頻率、下次日期、結束條件）。
- [ ] 建立時要走與一般新增相同的 batch（寫支出＋更新彙總欄位，見 `docs/operations.md` 的分帳計算）；Function 端無法重用前端 `increment` 邏輯時要另寫並測試。
- [ ] 外幣的匯率：以建立當天或固定匯率，需決定。
- [ ] 規則的管理介面（新增、暫停、刪除），以及誰能編輯（建立者或全體成員）。
- [ ] Functions 為公開端點且 `maxInstances: 5`；排程函式不需要對外，不要增加端點。

**風險**：自動寫入會讓成員看到不是自己新增的帳目，需有明顯標示與可刪除；Functions 成本。

---

## P10 統計趨勢範圍

原先構想的群組日期區間欄位已放棄（會提前記帳，區間會與實際用途衝突）。改為趨勢圖依帳目實際日期決定範圍。

- [x] 統計頁每月趨勢：從最早到最晚有帳目的月份，上限 12 個月（超過取最近 12 個月）；標題改為「每月趨勢」。

---

## P11 CSV 匯出美化

定位：個人保存用。維持 CSV（不新增套件）、只用群組基準幣、不含「誰該轉給誰」的結算建議、不沿用搜尋條件。組裝邏輯在 `src/utils/csvExport.js`（純函式，測試在 `csvExport.test.js`）。

- [x] 明細區：類型（支出、收入、轉帳）、日期（YYYY-MM-DD）、時間、標題、類別、付款人、收款人、金額（基準幣）、分帳方式、我的分攤、備註；依日期由舊到新。
- [x] 修正外幣支出付款人金額單位不一致：付款人與收款人金額本來就是基準幣，不再和原幣別的「原始金額」並列；原始金額、幣別、換算金額三欄拿掉。
- [x] 彙總區：群組總支出、（有才有）群組總收入、我支出已付、我支出應分攤、（有才有）我收入已收與應分得、（有才有）我轉帳轉出與轉入、我的淨餘額（與結算頁一致）。
- [x] 英文介面欄位標題（`csv.*` 已有中英兩份）；檔名沒有收入與轉帳時維持「支出明細」，否則「收支明細」。
- [x] UTF-8 BOM 與公式開頭防護沿用；補測試。
- 已不需要：每位成員的分攤欄位（個人保存只看自己的）、xlsx、字元上限重估（每列長度穩定）。
- 已知（未處理）：`TransferPage` 把轉帳金額直接計入成員餘額，不管轉帳幣別；非基準幣的轉帳可能讓餘額不準，CSV 照原樣輸出該金額。

---

## P12 個人記帳

目前只有群組分帳，沒有個人的收支紀錄。**這項範圍最大，動工前要先決定方向**：

- [ ] 決定模型：
  - 個人專屬的帳本（`users/{uid}/…`，只有本人可讀寫）。
  - 或沿用群組，建立「只有自己」的群組（現況已支援一人群組，但首頁、結算、邀請等介面對一人群組不合理）。
- [ ] 決定與群組分帳的關係：是否能把群組中「我的分攤」自動帶入個人帳本，避免重複記帳。
- [ ] 範圍：收入與支出、分類、帳戶、月報表、預算（可重用 P8 的結構）。
- [ ] 訪客沒有穩定身分（見 `docs/identity-and-guests.md`），先決定是否只開放 LINE 使用者。
- [ ] rules：個人資料只有本人可讀寫，並補 `firestore-tests`。
- [ ] 隱私權政策要補寫個人帳本的資料（見 `public/privacy.html`）。
- [ ] 產出設計說明後再拆項目（另存 `docs/` 或拆成子項）。

---

## P13 群組頁改版：導覽列與搜尋

動機：使用者看不懂底部導覽列的計算機圖示（結算）；群組頁的搜尋框會和明細、類別標籤擠在一起。分兩步，**依序做**：

**步驟 1：導覽列與結算按鈕**（`TabBar.jsx`、`GroupPage.jsx`）
- [x] 導覽列拿掉圖示下的文字（上一輪加的），回到純圖示；首頁與「＋」的圖示使用者看得懂。
- [x] 群組頁導覽列拿掉「結算」，剩首頁與「＋」兩個圖示，排版要保持對稱不偏空。
- [x] 「結算」改成文字按鈕（主色小圓角，寫「結算」兩字，不放圖示），放在「消費明細」標題列右側、搜尋入口旁。
- [x] 其他頁面（新增、結算、轉帳等）的導覽列只需同步拿掉文字，其餘不變。
- [x] 取捨：按鈕在列表區，往下捲就看不到；結算不是高頻操作，先接受。

**步驟 2：搜尋改成底部彈出的條件選單，按「搜尋」後直接篩選原列表**（`SearchSheet.jsx`、`searchFilter.js`、`GroupPage.jsx`）
- [x] 改版：原本做成全螢幕搜尋頁，使用者改要「彈出選單、選完按搜尋，在原群組頁顯示」，並參考 LINE 記帳類 App 的條件選單。
- [x] 選單條件：日期（全部時間、這個月、上個月、今年、去年、自訂區間）、類型（全部、支出、收入、轉帳）、類別、貨幣（群組用到兩種以上才顯示）、搜尋文字、範圍（全部／只與我相關的）；底部「重置」「搜尋」。
- [x] 篩選套用在群組頁原列表（含收入與轉帳）；有條件時列表上方顯示「符合 N 筆」與「清除篩選」，放大鏡旁有橘點。
- [x] 比對邏輯放 `src/utils/searchFilter.js`（純函式）並補 `searchFilter.test.js`；轉帳沒有類別，選了類別就不會出現。
- [x] 語言檔新增 `search.*`，`group.noMatch` 改成「找不到符合的帳目」，移除 `group.clearFilter`、`group.noCategoryMatch`。

**驗證**：兩步都用 emulator 加 headless Chrome 截圖給使用者看；手機寬度確認底部內容不被導覽列擋住；`npm run lint`、`npm test`、`npm run build`。更新 `README.md` 的功能清單（明細可依類別篩選與搜尋那一行）。

---

## P14 獨立帳號：多種登入方式與帳號綁定

定位：App 要成為**獨立服務**，不再只寄生在 LINE 裡。LINE 官方帳號只當加好友入口，**不做通知、不做推廣**（所以不需要任何推播、Messaging API 或訂閱追蹤）。資料要能跨登入方式共通：同一個人用 LINE 或其他方式登入，看到同一份群組與帳目；也能把 LINE 與其他帳號綁在一起。**範圍大，動工前先做設計決定，再拆項目**（類似 P12）。

**現況（設計的起點）**
- uid 直接等於 LINE userId（`lineLogin`、`verifyLiffToken` 發 custom token）；訪客的 uid 是 `p_` 開頭的成員 id（見 `docs/identity-and-guests.md`）。
- uid 散落在 `groups.members`、`memberProfiles` 的 key、支出與收入的 `payments`、`received`、`splits`、轉帳的 `from`、`to`、`memberBalances`，所以**帳號合併 = 改寫這些參照**。`migrateMember`（訪客認領與退出群組用）已經做了大半，可重用。
- Firestore rules 用 `isLineUser()`（其實是「不是訪客」）判斷；`users/{uid}/paymentMethods`、`users/{uid}/settings/profile`（全域暱稱）都以 uid 為 key。
- LINE 專屬的前端：LIFF 初始化、在 LINE 內自動登入、`sendMessages` 與 `shareTargetPicker`（只在 LINE 內建瀏覽器出現，不受其他登入影響）。

**要先決定**
- [ ] **提供哪些登入方式**：Google、Apple、Email（信箱連結或密碼）？先做哪一種。Apple 只有在做原生 App 才強制，純網頁可後做。
- [ ] **身分模型**（最關鍵）：
  - A. **內部 uid ＋ 身分對照表**：新增 `identities/{provider:subject}` → 內部 uid；現有 LINE 使用者的內部 uid 就是現在的 LINE userId（**向下相容、不用搬資料**）；所有登入方式都經 Cloud Function 驗證後發 custom token，uid 一律是內部 uid。綁定帳號 = 在對照表加一筆。
  - B. 沿用 Firebase Auth 原生帳號連結（`linkWithCredential`）：每種登入方式一個 Firebase uid，靠 Auth 合併。LINE 是 custom token、不是原生 provider，混用會很別扭。
  - 傾向 A，但要先驗證 custom token 與 rules、`request.auth.token` 的相容性。
- [ ] **綁定的方向與安全性**：綁定必須證明「兩個帳號都是本人」（同一個 session 內依序通過兩邊驗證），否則可被冒用接管別人的帳號；解除綁定要保證至少剩一種登入方式。
- [ ] **兩個帳號都已有資料時的合併**：兩個帳號可能在同一個群組裡各是一位成員，合併後同一人要併成一位（成員、`memberProfiles`、`memberBalances`、筆數、建立者、帳目參照）。先確認 `migrateMember` 在「目標已是成員」時對餘額與筆數是相加還是覆蓋，必要時修正並補測試。
- [ ] **名字與頭像的來源**：非 LINE 登入沒有 LINE 頭像與名字；全域暱稱（`users/{uid}/settings/profile`）要成為必填或有預設值；頭像是否允許自訂上傳。已做的「頭像、名字同步」要改成依來源。
- [ ] **訪客**：是否保留？訪客綁定其他登入方式（不只 LINE）時的認領流程（`claimMember`）。
- [ ] **登入畫面**：在 LINE 內自動登入維持不變；外部瀏覽器顯示多種登入選項；首頁、設定頁要有「已綁定的登入方式」管理。

**會牽動的工作（決定後再拆）**
- [ ] Cloud Functions：驗證各 provider 的憑證並發 token；綁定、解除綁定、合併帳號（會碰到所有群組，要能中途失敗重試）。
- [ ] `firestore.rules`：把 `isLineUser()` 改成不綁 LINE 的語意（例如「非訪客」），補 `firestore-tests`。
- [ ] 刪除我的資料（`deleteMyData`、`detachMember`）要涵蓋所有綁定的登入方式與對照表。
- [ ] `public/privacy.html`、`public/terms.html`（中英文）補寫新的登入方式與資料來源；`docs/identity-and-guests.md` 更新。
- [ ] `README.md` 與 `docs/operations.md`（新的 Firebase Auth provider 設定、網域授權）。

**風險**：uid 是整個資料模型的主鍵，錯誤的合併不可逆；要有 dry-run 與備份（見 `docs/operations.md` 備份）。LINE 的「官方帳號」與本項無關，維持現狀。

---

## 後續與已知小問題

**預算（第一版之後）**
- 分類預算：已移到 P8。
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
