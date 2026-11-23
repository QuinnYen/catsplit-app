# P14 獨立帳號：多種登入方式與帳號綁定（設計）

日期：2026-11-14　修訂：2026-11-23（依實作計畫補修）　狀態：已審閱，待實作。實作順序見 `../plans/2026-11-23-p14-identity-plan.md`

## 背景與整體決策（P18 首頁大改版的前提）

目標：把個人記帳、旅遊分帳、儲蓄目標、匯率計算整合成一個不依賴 LINE 的平台。

- **架構決策**：全部做在同一個專案（單一 Firebase 專案），以 `src/features/*` 功能模組分界，**不拆微服務**。理由：uid 是整個資料模型的主鍵、現有已是 serverless、四功能共用幣別／分類／帳戶／i18n、單人維護。日後若要做原生 App 或公開 API，再把單一功能抽成獨立 Function API。
- **定位（自原 todo P14）**：App 成為獨立服務，不再只寄生在 LINE，遲早要能完全脫離 LINE。LINE 官方帳號只當加好友入口，**不做通知、不做推廣**，所以不需要推播、Messaging API 或訂閱追蹤；LINE 官方帳號與本項無關，維持現狀。
- **子專案順序**：P14 身分 → P12 個人記帳 → 匯率工具頁 → P18 首頁整合。每個各走 spec → 計畫 → 實作。本文件只涵蓋 P14。

## 已確認的決定

| 項目 | 決定 |
|---|---|
| 新增登入方式 | 第一版只做 Google（LINE 維持）；Apple 移出第一版，列於「後續」 |
| 身分模型 | A：內部 uid + `identities` 對照表，所有登入經 Cloud Function 發 custom token |
| 訪客 | 保留；認領（`claimMember`）支援任一登入方式；訪客不能用個人功能，也不能發起綁定或合併 |
| 名字與頭像 | 新建立的 Google 帳號首次登入必填暱稱（預設帶 Google 名字），頭像用預設貓咪（之後再調整）；LINE 使用者（現有與新的）沿用 LINE 名字，不強迫填 |
| Google 憑證驗證 | 前端以 Google Identity Services 取得 ID token，後端用 `google-auth-library` 驗證；不用 Firebase 內建 `signInWithPopup`（會替換目前 session，綁定與合併無法保留原帳號） |
| 內部 uid 格式 | `u_` + 20 位隨機十六進位；不可以 `p_` 開頭（訪客 id 與 rules 依賴），LINE userId 不含底線，不會撞號 |
| 帳號合併 | 第一版就做完整合併。重疊的群組自動加總；暱稱頭像與個人資料的衝突由使用者逐項決定；含 dry-run、備份、斷點續跑 |
| 綁定方向 | LINE 先、Google 後，與 Google 先、LINE 後皆支援，統一走同一套綁定與合併流程 |

## 1. 身分與登入流程

- 新集合 `identities/{provider:subject}` → `{ uid, createdAt }`。provider 為 `line`、`google`。只有 Cloud Function 能讀寫（rules 全拒）。
- 現有 LINE 使用者：uid 即 LINE userId，對照項於登入時懶建立，**上線時另以一次性腳本補齊所有現有 LINE 使用者**，不搬資料。
- 新增 `authExchange`：前端取得 Google ID token，Function 驗證後以 `provider:subject` 查表；有則發該 uid 的 custom token，無則產生新內部 uid、建立 `users/{uid}` 與對照項再發 token。LINE 沿用 `verifyLiffToken`／`lineLogin`，加上查表。
- **查表與建立必須在 Firestore transaction 內完成**，避免同一個 Google 帳號從兩個裝置同時首次登入而建出兩個 uid。
- `request.auth.uid` 恆為內部 uid，`groups`、`expenses` 等資料與 rules 不變；`isLineUser()` 改名 `isMember()`（語意為「非訪客」）。
- 新建立的 Google 帳號（`authExchange` 回傳 `isNew`）且尚未設暱稱時，導向必填暱稱頁，之後才進首頁；LINE 使用者不經過此頁。
- `claimMember` 的呼叫端放寬為任一已登入的非訪客身分，邏輯不變。

## 2. 綁定與合併

### 綁定判斷

`bindIdentity`：已登入（非訪客）使用者再通過第二種身分驗證（兩邊 token 都由 Function 驗證；Google ID token 簽發後 10 分鐘內才接受，LINE 授權碼只能用一次）。**驗證與預覽在同一次呼叫完成**：偵測到需要合併時直接建立預覽並回傳 `mergeId`，不另設 `previewMerge` 端點（LINE 授權碼只能用一次，驗證完就沒有第二次機會）。另有 `listIdentities`（設定頁列出已綁定的登入方式，對照表客戶端讀不到）、`executeMerge`、`unbindIdentity` 三個端點。依第二身分的狀態分三種結果：

1. 第二身分不在對照表，且 `users/{subject}` 也不存在 → 新增一筆對照項即結束。
2. 第二身分已屬於同一個 uid → 已綁定，不做事。
3. 第二身分已屬於另一個 uid → 進入合併。

注意：對照表查不到 `line:X`，但 `users/X` 存在（尚未懶建立的舊 LINE 使用者）時，視為「已有 uid」，走第 3 種結果，不可當成新帳號。

### 合併

`mergeAccounts(keepUid, dropUid, resolutions)`：

合併分兩步，中間以伺服器端的 `merges/{id}` 紀錄串接（LINE OAuth `code` 只能使用一次，不能讓兩步都要求第二身分的憑證）：

1. **預覽（由 `bindIdentity` 偵測到需要合併時一併完成）**：兩邊須在同一次操作內通過驗證（發起人的 Firebase session 加第二身分的憑證）；訪客身分不能發起。驗證通過後建立 `merges/{id}`，狀態 `previewed`，存雙方 uid、`initiatorUid`、10 分鐘到期時間與衝突清單快照，回傳 `mergeId`。同一對帳號同時只允許一個進行中的合併。
2. **dry-run 內容**：回報受影響群組數、帳目筆數、自動處理的項目、需要使用者決定的衝突清單（具體項目，不只是數量），使用者確認後才執行。
3. **`executeMerge(mergeId, resolutions)`**：只需要發起人的 Firebase session 與 `mergeId`，並檢查發起人與紀錄一致、未過期。先備份 `dropUid` 資料到 `mergeBackups/{id}`；備份保留 30 天，由 GitHub Actions 每天排程（`.github/workflows/purge-merge-backups.yml`）清除過期的合併紀錄與備份，`executeMerge` 每次也順便清幾筆當備援。不用 Cloud Scheduler 排程函式：部署它需要額外啟用 API 與權限，部署失敗會連帶影響其他函式。
4. 查 `groups where members array-contains dropUid`，逐一呼叫 `migrateMember(group, dropUid, keepUid)`。
5. 搬 `users/{dropUid}/…` 個人資料（收款方式、暱稱、儲蓄、**個人帳本 `transactions` 與 `spendMethods`**，見 P12 spec），同 id 衝突依 `resolutions` 處理；使用者未指定的項目以預設建議值（較新者）為準。
6. 對照表 `dropUid` 的所有項目改指向 `keepUid`，最後才刪除 `dropUid` 帳號。

進度存 `merges/{id}` 狀態機：`previewed → started → groups_done → profile_done → done`，中途失敗可從斷點重試。

**執行規則（實作）**：
- 只有發起人能執行；預覽 10 分鐘內要確認，逾時需重新驗證（沒人確認的預覽紀錄一天後清除）。
- 用租約避免同時執行兩次：進行中且租約未過期（6 分鐘）時，再呼叫回 409；失敗時釋放租約，可立即重試。另外，任一帳號有進行中的其他合併，或這一對已在執行，新的預覽會被拒絕。
- 第一次執行時，用預覽存下的衝突清單加上使用者的選擇，定出完整的解決方案並存起來，之後重試一律用同一份，不受重試時傳入的選擇影響。
- 動資料之前先備份被併入帳號會被改動的資料（群組文件與會被改動的帳目、個人資料、被覆蓋的保留帳號文件、被併入帳號的對照項與 users 文件）；備份只做一次（`backupDone`），重試不重做，否則會備份到搬移後的資料。
- 收尾依序：被併入帳號的對照項改指向保留帳號（舊 LINE 使用者還沒有對照項時補建）→ 刪 `users/{drop}` → 刪 Auth → 標記完成。每一步都可重複執行。

**完成後換 token**：`executeMerge` 結束時回傳 `keepUid` 的 custom token，前端用它重新登入。若發起人是被刪除的那一邊（`dropUid`），他原本的 session 會失效，必須靠這個 token 接續。

### 衝突的分類

**自動處理，不讓使用者選**（兩邊都有真實帳目，留一邊會弄丟資料）：
- 兩邊都在同一個群組：金額、餘額、筆數相加（`migrateMember` 現有行為）。
- 只有一邊在的群組：直接把成員身分改到合併後的 uid。
- 合併後出現的轉帳 `from === to`：直接刪除該筆轉帳（自己轉給自己，對餘額沒有影響；實作前需讀結算計算確認轉帳只是對沖），不讓使用者選。

**由使用者決定**（`resolutions` 的內容）：
- 暱稱與頭像：兩邊各有一組，選留哪一個。
- 個人資料同 id 的項目：收款方式、付款方式、儲蓄目標（含存提款紀錄）都是自動產生 id，不會衝突，直接搬移；真正會衝突的只有固定 id 的文件，例如暱稱（`settings/profile`）、`settings/oaPrompt`，以及 P12 個人帳本群組匯入的 `group_{groupId}`。這些逐項選 A 或 B。個人資料以 `listCollections` 遍歷搬移，不寫死集合名稱，P12 的新集合自動涵蓋。
- 每項預設帶建議值，使用者只需確認，有疑慮再改。

**`keepUid` 由系統決定**，不讓使用者選：保留群組數較多者，需要搬動的資料最少。對使用者而言保留哪個 uid 沒有差別。

### 解除綁定

- 至少保留一種登入方式；同一種登入方式可以綁定多個（例如兩個 Google 帳號），不限制每種一個。
- **舊 LINE 使用者自己的 LINE 不能直接刪對照項**：他的 uid 就是 LINE userId，下次 LINE 登入會把對照項懶建立回來，等於沒解除。改成把該對照項指向一個新的空帳號，之後用這個 LINE 登入的是新帳號；日後再綁定回來會被視為另一個帳號而要求合併。
- 解除 LINE 綁定後 uid 不變（uid 只是字串，與 LINE 無關）；LINE 專屬功能自然不再可用。

### 重用 `migrateMember` 的現況確認（2026-11-14 讀碼）

- 目標已是成員時，`moveKey` 以 `round2` **相加**金額，`memberBalances`、支出的 `payments`／`splits` 皆正確合併。**`memberExpenseCounts` 不是**：它是「參與分攤的支出筆數」，兩個帳號可能參與同一筆支出，直接相加會重複計算（例如各參與 2 筆、其中 2 筆相同，應為 2 而不是 4）。2026-11-23 實作時發現並修正：目標已是成員時，筆數改由搬移後的支出文件重算。
- 先改子集合、最後改群組文件，失敗後 `fromId` 仍在 `members`，可重試；`members` 以 Set 去重；`memberProfiles` 以目標原有為主。
- **缺口（需補，PR4 已補）**：轉帳合併後 `from === to`（刪除，轉帳是對沖，淨效果為 0）；`users/{uid}/…` 個人資料（`memberOps.movePersonalData`）；以 uid 反查所屬群組（`memberOps.findGroupsOf`）；上述筆數重算。

## 3. 介面、刪除、rules、測試、上線

**介面**
- 登入畫面：LINE 內自動登入不變；外部瀏覽器顯示 LINE／Google 兩按鈕，LINE 內建瀏覽器的登入畫面不顯示 Google 按鈕；訪客入口維持。
- 設定頁新增「登入方式」：列出已綁定 provider、解除綁定、綁定其他方式。**LINE 內建瀏覽器的設定頁不放 Google 按鈕**（Google 不允許在內嵌 WebView 登入，實測 Android 彈出視窗會停在 Google 的 `accounts.google.com/transform` 頁面）：改成「用 Google 綁定」，由 LINE 內已登入的帳號產生一次性連結碼，帶著登入狀態開啟手機的外部瀏覽器，在那裡用手機上已登入的 Google 帳號完成綁定（`createLinkCode`、`redeemLinkCode`、`/link` 頁，設計見 `docs/identity-and-guests.md`）。
- 新增「合併確認頁」：顯示將搬動的群組數與帳目筆數、自動加總的群組、需要決定的衝突清單；每項帶預設建議值，使用者確認或修改後才執行。
- LINE 專屬功能（`sendMessages`、`shareTargetPicker`）維持只在 LINE 內建瀏覽器出現；非 LINE 環境以複製邀請連結或 Web Share 替代。
- LINE 內建瀏覽器常擋 Google OAuth，LINE 內綁定 Google 需導向外部瀏覽器完成，實作時要實測 LINE 內、外部瀏覽器、手機 PWA 三種環境。

**刪除我的資料**：`deleteMyData`、`detachMember` 一併刪除該 uid 的所有 `identities`、`merges`、`mergeBackups`，並排入既有刪除順序（只有自己的群組 → 收款方式 → 退出群組 → 刪對照表與合併紀錄 → 刪 Auth）。`mergeBackups` 內含另一帳號資料，不可漏刪；隱私權政策須說明備份保留 30 天。

**rules 與測試**
- `identities`、`merges`、`mergeBackups` 客戶端全拒。
- `firestore-tests`：對照表不可被客戶端讀寫；訪客不能存取個人集合。
- `migrate.test.js` 補「目標已是成員」、「轉帳變自付」。
- `authExchange` 的查表邏輯與合併的衝突分類、`resolutions` 套用邏輯抽成純函式，補各種組合的單元測試（兩邊都在同一群組、只有一邊在、個人資料同 id、轉帳自付）。
- 測試限制：emulator 不啟動 functions，無法端到端測合併；以純函式單元測試為主，再用測試用 Firebase 專案以兩個測試帳號實跑。

**上線順序**
1. 上對照表與 `authExchange`，LINE 登入照舊並懶建立對照項；執行補齊腳本。
2. 上 Google 登入與首次暱稱頁。
3. 補 `migrateMember` 的缺口，上 `bindIdentity` 與 `mergeAccounts`，先以兩個測試帳號在測試專案實跑。
4. 上設定頁「登入方式」與合併確認頁。

**文件**：更新 `docs/identity-and-guests.md`、`public/privacy.html`、`public/terms.html`（中英文）、`docs/operations.md`（Firebase Auth provider 設定、網域授權）、`README.md`。

## 風險

- uid 是資料模型主鍵，錯誤的合併不可逆：必須 dry-run、備份、可重試，且先在測試專案實測。事後還原靠腳本，第一版不做一鍵還原。
- 第一版納入完整合併（含使用者逐項選擇）使工作量約為「只綁定」的 2–3 倍，主要在合併確認頁與合併函式的測試；若吃緊可退回只綁定，其餘設計不受影響。
- 衝突項目過多會增加使用者負擔，因此每項都要帶預設建議值。
- 不能把 email 當身分鍵，一律以 `subject` 為準。

## 後續（不在第一版）

- Apple 登入：需要 Apple Developer 帳號與網域設定，使用者可能隱藏信箱，仍以 `subject` 為準。上原生 iOS App 時再加。
- 一鍵還原合併。
- 自訂頭像上傳。

## 不在本項範圍

個人記帳（P12）、匯率頁、P18 首頁、LINE 群組 Bot（P17）。
