# TODO

> 更新日期：2026-11-03。只列尚未完成的項目；已完成的功能（P0 共用基礎、P1 多國語言、P2 網頁版置中、P3 收入、P4 預算第一版、P10 統計趨勢範圍、P11 CSV 匯出美化、P13 群組頁改版）見 `README.md` 與 `docs/`。
> 狀態：`[ ]` 未開始　`[~]` 進行中

**每項完成時都要做**：`npm run lint`、`npm test`、`npm run build`；更新 `README.md` 功能清單與相關 `docs/`；涉及 rules 或 functions 的，**rules 與前端放在同一個 PR**（CI 推 `main` 就部署，新欄位沒有 rules 會在正式環境被拒絕）；rules 改動要有測試（`npm run test:rules`）並用兩個帳號實測（見 `docs/operations.md`）。

| # | 項目 | 狀態 |
|---|---|---|
| P5 | 更多收款碼 | [ ] |
| P7 | 逐項分帳 | [ ] |
| P8 | 分類預算 | [ ] |
| P9 | 重複性支出 | [ ] |
| P12 | 個人記帳 | [ ] |
| P14 | 獨立帳號：多種登入方式與帳號綁定 | [ ] |
| P17 | 群組 Bot 與 LINE 群組綁定 | [ ] |
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

## P7 逐項分帳

現況：一筆支出只能選一種分帳方式（均分、部分均分、份數、百分比、自訂金額），整筆套同一個比例；`splits` 是每人分攤金額的 map。

- [ ] 支出新增「品項」：每項有名稱、金額、分攤對象（可多人）；各項分攤加總後寫入 `splits`，讓 `computeGroupAggregates`、結算、統計不用改。
- [ ] 品項明細要不要存進支出文件（`items`）：存了才能編輯與顯示，但要補 rules 驗證與 `EditExpensePage` 還原。
- [ ] 稅金與服務費：按各人品項小計比例分攤，或平均分，需決定預設。
- [ ] 外幣：品項金額在原幣別，換算沿用 `applyExchangeRate`（尾差歸最大出資者）。
- [ ] 與收據照片的關係：先只做手動輸入，OCR 另議。
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

## P17 群組 Bot 與 LINE 群組綁定

來源：`CatSplit × LINE 平台 API 研究報告…（2026-11）.md` §4 P17。在 LINE 群組內查結算、餘額、記帳，回覆一律用 **reply（不計費）**。

**前置（本項不含，需先有）**：Messaging API webhook 基礎（`lineWebhook` 驗簽、冪等、`lineProcessEvent`）；官方帳號 @uhu2720z 啟用 Messaging API，且 **channel 與 LINE Login channel 同一個 Provider**（否則 webhook 的 userId 對不上）；Console 開啟 Use webhook、Webhook redelivery、Allow bot to join group chats；OA Manager 關閉或縮小自動回應。

**限制**：`liff.getContext()` 已拿不到 `groupId`（2023-02 停止提供），只能從 webhook 端取得；一般帳號不能列出群組全部成員 userId（只限認證或 premium），要靠成員發言或 LIFF 登入逐步對應；群組 postback 不保證有 `source.userId`；Loading animation 只限 1 對 1。

- [ ] **綁定流程**：
  - [ ] `join` 事件 → 以 reply 送歡迎 Flex，按鈕 URI 指向 `https://liff.line.me/{liffId}/bind?code={一次性綁定碼}`。
  - [ ] 綁定碼存 `lineGroupBindCodes/{code}`：`{lineGroupId, expiresAt（10 分鐘）, usedAt}`。
  - [ ] LIFF 綁定頁：列出使用者有權限的 CatSplit 群組 → callable `lineBindGroup` 驗證碼與權限 → 寫入 `lineGroups/{lineGroupId}.catsplitGroupId` 與 `groups/{gid}.lineGroupId`。
- [ ] **指令**（reply）：
  - [ ] 「結算」「餘額」「@小明 欠多少」→ 回傳 Flex 結算卡。
  - [ ] 「午餐 300 @小明 @小華」→ 用 `mentionees[].userId` 對應成員（不比對顯示名稱）；解析成功回「確認新增」卡，按鈕用 URI 開 LIFF 確認頁（避開群組 postback 無 userId）。
- [ ] **事件**：
  - [ ] `messageEdited`：以 timestamp 最大者為準更新草稿金額（事件可能亂序）。
  - [ ] `unsend`：刪除未確認的草稿。
  - [ ] `leave`：解除群組綁定；`memberLeft`：標記成員已離開。
- [ ] **Functions**：`lineBindGroup`（onCall）；`lineProcessEvent` 內新增 `handlers/group.ts`、`handlers/command.ts`。
- [ ] **Firestore**：`lineGroups/{lineGroupId}`、`lineGroupBindCodes/{code}`、`groups/{gid}.members[].lineUserId`；`line*` 集合 rules 一律 `allow read, write: if false`（只給 Admin SDK）。
- [ ] 文件：`docs/` 新增群組 Bot 說明；`README.md` 功能清單、`docs/operations.md`（Secrets、Console 設定）。

**驗證**：綁定碼過期與重複使用；非群組成員誤綁；1 分鐘內一定要 reply（重度計算不可依賴 loading）；兩個帳號實測 rules。

**風險**：綁定碼外流會讓外人把群組綁到別人的 CatSplit 群組 → 必須驗證操作者是該群組成員且綁定碼一次性；Bot 在群組內只能靠 reply，超過 1 分鐘或使用者沒觸發事件就得 push（計費，依群組人數算）。

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
- 官方帳號加好友：授權畫面的選項只在第一次授權出現。已改為在 LINE 內進 App 時（任何頁面），對非好友呼叫 `liff.requestFriendship()`，每 30 天最多一次（`useOfficialAccountPrompt`，掛在 `App.jsx` 的 `ProtectedRoutes`），上次檢查時間存 `users/{uid}/settings/oaPrompt`；首頁與群組設定的「官方帳號」入口保留。已在 LINE 實測：封鎖或刪除過官方帳號的人，LINE 會改問「解除封鎖」（`getFriendship` 分不出兩者，LINE 行為，非 bug）。
