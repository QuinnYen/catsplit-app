# P14 獨立帳號：多種登入方式與帳號綁定（設計）

日期：2026-11-14　修訂：2026-11-23　狀態：已審閱，待實作

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
| 名字與頭像 | 首次登入必填暱稱（預設帶 provider 名字），頭像用預設貓咪（之後再調整） |
| 帳號合併 | 第一版就做完整合併。重疊的群組自動加總；暱稱頭像與個人資料的衝突由使用者逐項決定；含 dry-run、備份、斷點續跑 |
| 綁定方向 | LINE 先、Google 後，與 Google 先、LINE 後皆支援，統一走同一套綁定與合併流程 |

## 1. 身分與登入流程

- 新集合 `identities/{provider:subject}` → `{ uid, createdAt }`。provider 為 `line`、`google`。只有 Cloud Function 能讀寫（rules 全拒）。
- 現有 LINE 使用者：uid 即 LINE userId，對照項於登入時懶建立，**上線時另以一次性腳本補齊所有現有 LINE 使用者**，不搬資料。
- 新增 `authExchange`：前端取得 Google ID token，Function 驗證後以 `provider:subject` 查表；有則發該 uid 的 custom token，無則產生新內部 uid、建立 `users/{uid}` 與對照項再發 token。LINE 沿用 `verifyLiffToken`／`lineLogin`，加上查表。
- **查表與建立必須在 Firestore transaction 內完成**，避免同一個 Google 帳號從兩個裝置同時首次登入而建出兩個 uid。
- `request.auth.uid` 恆為內部 uid，`groups`、`expenses` 等資料與 rules 不變；`isLineUser()` 改名 `isMember()`（語意為「非訪客」）。
- 首次登入導向必填暱稱頁，之後才進首頁。
- `claimMember` 的呼叫端放寬為任一已登入的非訪客身分，邏輯不變。

## 2. 綁定與合併

### 綁定判斷

`bindIdentity`：已登入使用者再通過第二種身分驗證（兩邊 token 都由 Function 驗證）。依第二身分的狀態分三種結果：

1. 第二身分不在對照表，且 `users/{subject}` 也不存在 → 新增一筆對照項即結束。
2. 第二身分已屬於同一個 uid → 已綁定，不做事。
3. 第二身分已屬於另一個 uid → 進入合併。

注意：對照表查不到 `line:X`，但 `users/X` 存在（尚未懶建立的舊 LINE 使用者）時，視為「已有 uid」，走第 3 種結果，不可當成新帳號。

### 合併

`mergeAccounts(keepUid, dropUid, resolutions)`：

1. 兩邊須在同一 session 內通過驗證才能啟動，驗證有效時間有限（逾時重新驗證）；訪客身分不能發起。
2. **dry-run**：回報受影響群組數、帳目筆數、自動處理的項目、需要使用者決定的衝突清單（具體項目，不只是數量），使用者確認後才執行。
3. 備份 `dropUid` 資料到 `mergeBackups/{id}`，保留 30 天。
4. 查 `groups where members array-contains dropUid`，逐一呼叫 `migrateMember(group, dropUid, keepUid)`。
5. 搬 `users/{dropUid}/…` 個人資料（收款方式、暱稱、儲蓄、**個人帳本 `transactions` 與 `spendMethods`**，見 P12 spec），同 id 衝突依 `resolutions` 處理；使用者未指定的項目以預設建議值（較新者）為準。
6. 對照表 `dropUid` 的所有項目改指向 `keepUid`，最後才刪除 `dropUid` 帳號。

進度存 `merges/{id}` 狀態機：`started → groups_done → profile_done → done`，中途失敗可從斷點重試。

### 衝突的分類

**自動處理，不讓使用者選**（兩邊都有真實帳目，留一邊會弄丟資料）：
- 兩邊都在同一個群組：金額、餘額、筆數相加（`migrateMember` 現有行為）。
- 只有一邊在的群組：直接把成員身分改到合併後的 uid。
- 合併後出現的轉帳 `from === to`：自動轉為自付或移除，不讓使用者選。

**由使用者決定**（`resolutions` 的內容）：
- 暱稱與頭像：兩邊各有一組，選留哪一個。
- 個人資料同 id 的項目（收款方式、儲蓄目標、個人帳本，例如群組匯入的固定 id `group_{groupId}`）：逐項或逐類選 A 或 B。
- 每項預設帶建議值，使用者只需確認，有疑慮再改。

**`keepUid` 由系統決定**，不讓使用者選：保留群組數較多者，需要搬動的資料最少。對使用者而言保留哪個 uid 沒有差別。

### 解除綁定

- 至少保留一種登入方式。
- 解除 LINE 綁定後 uid 不變（uid 只是字串，與 LINE 無關）；LINE 專屬功能自然不再可用。

### 重用 `migrateMember` 的現況確認（2026-11-14 讀碼）

- 目標已是成員時，`moveKey` 以 `round2` **相加**金額，`memberBalances`、`memberExpenseCounts`、支出的 `payments`／`splits` 皆正確合併。
- 先改子集合、最後改群組文件，失敗後 `fromId` 仍在 `members`，可重試；`members` 以 Set 去重；`memberProfiles` 以目標原有為主。
- **缺口（需補）**：轉帳合併後 `from === to`；`users/{uid}/…` 個人資料；以 uid 反查所屬群組。

## 3. 介面、刪除、rules、測試、上線

**介面**
- 登入畫面：LINE 內自動登入不變；外部瀏覽器顯示 LINE／Google 兩按鈕，訪客入口維持。
- 設定頁新增「登入方式」：列出已綁定 provider、解除綁定、綁定其他方式。
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
