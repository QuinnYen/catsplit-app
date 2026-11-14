# P14 獨立帳號：多種登入方式與帳號綁定（設計）

日期：2026-11-14　狀態：待審閱

## 背景與整體決策（P18 首頁大改版的前提）

目標：把個人記帳、旅遊分帳、儲蓄目標、匯率計算整合成一個不依賴 LINE 的平台。

- **架構決策**：全部做在同一個專案（單一 Firebase 專案），以 `src/features/*` 功能模組分界，**不拆微服務**。理由：uid 是整個資料模型的主鍵、現有已是 serverless、四功能共用幣別／分類／帳戶／i18n、單人維護。日後若要做原生 App 或公開 API，再把單一功能抽成獨立 Function API。
- **定位（自原 todo P14）**：App 成為獨立服務，不再只寄生在 LINE。LINE 官方帳號只當加好友入口，**不做通知、不做推廣**，所以不需要推播、Messaging API 或訂閱追蹤；LINE 官方帳號與本項無關，維持現狀。
- **子專案順序**：P14 身分 → P12 個人記帳 → 匯率工具頁 → P18 首頁整合。每個各走 spec → 計畫 → 實作。本文件只涵蓋 P14。

## 已確認的決定

| 項目 | 決定 |
|---|---|
| 新增登入方式 | Google、Apple（LINE 維持） |
| 身分模型 | A：內部 uid + `identities` 對照表，所有登入經 Cloud Function 發 custom token |
| 訪客 | 保留；認領（`claimMember`）支援任一登入方式；訪客不能用個人功能 |
| 名字與頭像 | 首次登入必填暱稱（預設帶 provider 名字），頭像用預設貓咪 |
| 帳號合併 | 第一版就做（含 dry-run、備份、斷點續跑） |

## 1. 身分與登入流程

- 新集合 `identities/{provider:subject}` → `{ uid, createdAt }`。provider 為 `line`、`google`、`apple`。只有 Cloud Function 能讀寫（rules 全拒）。
- 現有 LINE 使用者：uid 即 LINE userId，對照項於登入時懶建立（可另備一次性腳本補齊），不搬資料。
- 新增 `authExchange`：前端取得 Google／Apple ID token，Function 驗證後以 `provider:subject` 查表；有則發該 uid 的 custom token，無則產生新內部 uid、建立 `users/{uid}` 與對照項再發 token。LINE 沿用 `verifyLiffToken`／`lineLogin`，加上查表。
- `request.auth.uid` 恆為內部 uid，`groups`、`expenses` 等資料與 rules 不變；`isLineUser()` 改名 `isMember()`（語意為「非訪客」）。
- 首次登入導向必填暱稱頁，之後才進首頁。
- `claimMember` 的呼叫端放寬為任一已登入的非訪客身分，邏輯不變。

## 2. 綁定與合併

- `bindIdentity`：已登入使用者再通過第二種身分驗證（兩邊 token 都由 Function 驗證）。第二身分不在對照表 → 新增一筆即結束；已屬於另一個 uid → 進入合併。
- `mergeAccounts(keepUid, dropUid)`：
  1. 兩邊須在同一 session 內通過驗證才能啟動。
  2. **dry-run**：回報受影響群組數、帳目筆數、衝突（例如轉帳 `from === to`），使用者確認後才執行。
  3. 備份 `dropUid` 資料到 `mergeBackups/{id}`，保留 30 天。
  4. 查 `groups where members array-contains dropUid`，逐一呼叫 `migrateMember(group, dropUid, keepUid)`。
  5. 搬 `users/{dropUid}/…` 個人資料（收款方式、暱稱、儲蓄、**個人帳本 `transactions` 與 `spendMethods`**，見 P12 spec），同 id 衝突（例如群組匯入的固定 id `group_{groupId}`）以 `keepUid` 為準。
  6. 對照表 `dropUid` 的所有項目改指向 `keepUid`，最後才刪除 `dropUid` 帳號。
  - 進度存 `merges/{id}` 狀態機：`started → groups_done → profile_done → done`，中途失敗可從斷點重試。
- 解除綁定：至少保留一種登入方式。

### 重用 `migrateMember` 的現況確認（2026-11-14 讀碼）

- 目標已是成員時，`moveKey` 以 `round2` **相加**金額，`memberBalances`、`memberExpenseCounts`、支出的 `payments`／`splits` 皆正確合併。
- 先改子集合、最後改群組文件，失敗後 `fromId` 仍在 `members`，可重試；`members` 以 Set 去重；`memberProfiles` 以目標原有為主。
- **缺口（需補）**：轉帳合併後 `from === to`；`users/{uid}/…` 個人資料；以 uid 反查所屬群組。

## 3. 介面、刪除、rules、測試、上線

**介面**
- 登入畫面：LINE 內自動登入不變；外部瀏覽器顯示 LINE／Google／Apple 三按鈕，訪客入口維持。
- 設定頁新增「登入方式」：列出已綁定 provider、解除綁定、綁定其他方式；偵測到合併時先顯示 dry-run 摘要。
- LINE 專屬功能（`sendMessages`、`shareTargetPicker`）維持只在 LINE 內建瀏覽器出現。

**刪除我的資料**：`deleteMyData`、`detachMember` 一併刪除該 uid 的所有 `identities`、`merges`、`mergeBackups`。

**rules 與測試**
- `identities`、`merges`、`mergeBackups` 客戶端全拒。
- `firestore-tests`：對照表不可被客戶端讀寫；訪客不能存取個人集合。
- `migrate.test.js` 補「目標已是成員」、「轉帳變自付」；`authExchange` 的查表邏輯抽純函式測試。

**上線順序**
1. 上對照表與 `authExchange`，LINE 登入照舊並懶建立對照項。
2. 上 Google、Apple 登入與首次暱稱頁。
3. 上綁定與合併，先以兩個測試帳號在 emulator 實跑。

**文件**：更新 `docs/identity-and-guests.md`、`public/privacy.html`、`public/terms.html`（中英文）、`docs/operations.md`（Firebase Auth provider 設定、網域授權）、`README.md`。

## 風險

- uid 是資料模型主鍵，錯誤的合併不可逆：必須 dry-run、備份、可重試，且先在 emulator 實測。
- 第一版納入合併使工作量約為「只綁定」的 2–3 倍；若吃緊可退回只綁定，其餘設計不受影響。
- Apple 登入需 Apple Developer 帳號與網域設定；使用者可能隱藏信箱，不能把 email 當身分鍵（以 `subject` 為準）。

## 不在本項範圍

個人記帳（P12）、匯率頁、P18 首頁、自訂頭像上傳、LINE 群組 Bot（P17）。
