# P14 獨立帳號：實作計畫

日期：2026-11-23　對應設計：[`../specs/2026-11-14-p14-identity-design.md`](../specs/2026-11-14-p14-identity-design.md)　狀態：決策已確認，可從 PR1 開工

## 0. 目標

LINE 維持主要登入，新增 Google 登入；LINE 與 Google 可互相綁定，兩邊都有資料時可合併（重疊的群組自動加總，暱稱與個人資料衝突由使用者決定）。身分改由內部 uid 加 `identities` 對照表承載，之後可完全脫離 LINE。

## 1. 讀碼後的現況（會影響實作的事實）

1. **前端把 uid 當成 LINE userId。** `AppContext.jsx` 三處（快速路徑、完整流程、`completeOAuthCallback`）都用 `profile.userId` / `data.userId` 當 `user.uid`，快速路徑還拿 `liff.getDecodedIDToken().sub` 與 `cached.uid` 比對。對照表上線後，合併過的 LINE 使用者 uid 不再等於 LINE userId，這三處與快速路徑的比對條件都要改成「以伺服器回傳的 uid 為準」。
2. **後端兩支登入函式都直接 `createCustomToken(LINE userId)`**（`functions/index.js` 的 `lineLogin`、`verifyLiffToken`），回傳欄位叫 `userId`。
3. **`migrateMember` 已能處理「目標已是成員」**，但有三個缺口：轉帳 `from === to`、`users/{uid}/…` 個人資料、以 uid 反查群組。另外它是群組內非原子操作，靠「最後才改群組文件」支撐重試。
4. **`isLineUser()` 實際語意是「非訪客」**，rules 內 10 多處使用，測試檔也依賴 `{ guest: true }`。改名為 `isMember()` 是純機械式修改，但 rules 與前端必須同一個 PR。
5. **個人資料的 id 幾乎都是自動產生**：`paymentMethods`、`spendMethods`、`savingsGoals`（含 `entries`）都用 `addDoc`，合併時不會 id 衝突，直接搬即可。**真正會衝突的只有固定 id 的文件**：`settings/profile`（暱稱）、`settings/oaPrompt`，以及 P12 預計的 `group_{groupId}`。所以「使用者逐項決定」的介面其實很小。
6. **`users/{uid}` 文件由 `syncUserProfile` 以 Admin SDK 寫入**，內容是 LINE 名稱與頭像；Google 使用者要寫對應內容。
7. **`useSyncMemberProfile` 會把 `user.name` / `user.avatar` 同步進所有群組**，Google 使用者沒有頭像（用預設貓咪），同步邏輯對 `avatar` 為 null 已有保護，不用改。
8. **`deleteMyData` 在前端依序刪各集合，最後呼叫 `detachMember`（deleteAccount）**；新增的 `identities`、`merges`、`mergeBackups` 客戶端讀寫不到，必須在 `detachMember` 內由後端刪除。
9. **CI：push `main` 會同時部署 hosting、functions、firestore rules、storage**（`firebase-hosting-merge.yml`）。因此每個 PR 合併後都是「立刻上線」，每一步都必須向下相容，rules 與前端放同一個 PR。PR 預覽只部署 hosting，不含 functions。
10. **LINE OAuth `code` 只能用一次。** 設計文件的「dry-run 後再執行」若兩步都帶 LINE code 會失敗，見下方「設計補修」。
11. **`docs/operations.md` 說模擬器不啟動 functions，所以訪客與合併無法本機測。** Firebase 模擬器其實可以同時起 `functions`、`auth`、`firestore`，值得做一次 spike（見 PR1）。

## 2. 對設計文件的補修（需同步修改 spec）

1. **合併改成兩步，中間以伺服器端紀錄串接。** `previewMerge` 驗證雙方身分後建立 `merges/{id}`（狀態 `previewed`，存雙方 uid、`initiatorUid`、10 分鐘到期、衝突清單快照），回傳 `mergeId`；`executeMerge(mergeId, resolutions)` 只需要發起人的 Firebase session 與 `mergeId`，不再要求第二身分的一次性憑證。狀態機改為 `previewed → started → groups_done → profile_done → done`。
2. **合併完成後回傳新的 custom token。** 若發起人是被刪除的那一邊（`dropUid`），他的 session 會失效，必須換成 `keepUid` 的 token 重新登入。
3. **加上 `mergeBackups` 的定期清除。** 設計寫了「保留 30 天」，但沒有清除機制，需要一支排程函式。
4. **「首次登入必填暱稱」只套用在新建立的 Google 帳號。** 現有 LINE 使用者與新的 LINE 使用者仍用 LINE 名字當預設，不強迫填。

## 3. 決策（需要你確認）

| # | 問題 | 建議 | 原因 |
|---|---|---|---|
| D1 | Google 憑證怎麼驗證 | **Google Identity Services 取 ID token，後端用 `google-auth-library` 驗證** | 不碰 Firebase 目前的登入狀態。用 Firebase 內建的 `signInWithPopup` 會直接替換掉目前的 session，綁定與合併流程無法保留原帳號，還會產生多餘的 Auth 使用者要清理 |
| D2 | 內部 uid 格式 | **`u_` + 20 位隨機十六進位** | 不能以 `p_` 開頭（rules 與 `isGuestId` 依賴），LINE userId 不含底線，不會撞號 |
| D3 | 合併後 `from === to` 的轉帳 | **刪除該筆轉帳** | 自己轉給自己對餘額沒有影響。實作前要先讀 `SettlePage` 的結算計算，確認轉帳確實只是對沖 |
| D4 | 測試環境與上線 | **已決定：個人側專案，直接部署上線，不另建測試專案** | 端到端測試靠模擬器（PR1 的 spike）；仍維持每個 PR 向下相容，並保留備份與 dry-run，因為正式資料就是唯一一份 |
| D5 | LINE 內建瀏覽器的 Google 登入 | **已決定：登入畫面不顯示 Google 按鈕，但設定頁仍可綁定** | 若 Google 授權被 LINE 內建瀏覽器擋住，提示並提供「在外部瀏覽器開啟」 |

D1 到 D3 皆照建議，已決定。四項設計補修已於 2026-11-23 寫回 spec。

另外，**你需要自己做的事**：在 Google Cloud Console 建立 OAuth 用戶端 ID（網頁應用程式），授權網域加入 `catsplit-app.web.app`、`catsplit-app.firebaseapp.com`、`http://localhost:5173`。完成後把 Client ID 給我（它不是機密）。

## 4. 分階段 PR

每個 PR 都要通過 `npm run lint`、`npm test`、`npm run build`；涉及 rules 的加跑 `npm run test:rules`；並更新相關 `docs/`。規模以 S / M / L 表示相對大小。

**合併流程（已決定）**：每個 PR 各自獨立合併、各自部署，不累積。一個 PR 合併並部署、確認正常後，才從最新的 `main` 重新開始同名開發分支做下一個。已部署的 PR 要先在正式環境驗證（LINE 內登入、外部瀏覽器登入、建立群組、記帳），有異常就先修，不往下做。補齊腳本在 PR1 部署後就跑一次，PR5 上線前再 dry-run 確認缺 0 筆。

### PR1：身分基礎，LINE 行為不變（M）

後端與 rules，使用者看不出差異。

- 新增 `functions/identity.js`（純函式，無 import）：`makeUid`、`identityKey(provider, subject)`、`pickUid`。
- 新增 `functions/identity.test.js`。
- 修改 `functions/index.js`：`lineLogin`、`verifyLiffToken` 改為 transaction 內「查 `identities/line:{sub}` → 有則用該 uid、無則檢查 `users/{sub}` 是否已存在（存在視為舊使用者，uid 就是 `sub`）並建立對照項」；回應新增 `uid`，**保留 `userId`** 以相容舊版前端。
- 新增 `scripts/backfill-identities.mjs`：掃描 `users/` 與群組 `members`，為現有 LINE 使用者補對照項，預設 dry-run。
- 修改 `firestore.rules`：`isLineUser()` 改名 `isMember()`；`identities`、`merges`、`mergeBackups` 明確註記全拒。
- 修改 `firestore-tests/*.mjs`：配合改名；新增 `identities.rules.mjs`（客戶端讀寫皆被拒、訪客不能存取個人集合）。
- **Spike（已完成）**：`firebase emulators:start --only auth,firestore,functions` 可在本機實跑 functions。LINE 驗證端點用預載檔 `functions/scripts/emulator-line-mock.mjs` 攔截，不改正式程式碼。已實測 `verifyLiffToken` 的查表（新使用者、重複登入、對照項指向別的 uid、並行 10 次只建一筆）、補齊腳本與 `guestLogin`，做法寫在 `docs/operations.md`。後續 PR 的端到端測試沿用這個方式。

完成條件：現有 LINE 使用者登入、群組、記帳完全正常；`identities` 有資料；rules 測試通過。

**PR5 備忘**：`resolveUidForLine` 目前在 transaction 失敗時退回 LINE userId（此時還沒有合併，對照項必然等於 LINE userId）。合併上線後必須移除這個退路，改成登入失敗。

### PR2：前端改以伺服器 uid 為準（S）

- 修改 `src/context/AppContext.jsx`：`user.uid` 取自 `data.uid ?? data.userId`，快速路徑改比對「快取使用者 uid、`auth.currentUser.uid`」，不再與 LIFF `sub` 比較；本機快取 `catsplit_user` 結構不變（舊使用者 uid 本來就相同，不需遷移）。
- 把 `signInWithLineToken` 重構為通用的「換 token 並認領訪客名字」，供 Google 登入共用。

完成條件：LINE 使用者行為不變；用 `console` 或測試帳號確認 uid 來源是伺服器回傳。

### PR3：Google 登入與首次暱稱頁（L）

- 新增 `functions` 的 `authExchange`：驗證 Google ID token（D1）→ 查表或新建 `u_…` uid 並建立 `users/{uid}`（transaction）→ 回傳 `{ uid, firebaseToken, isNew }`。驗證邏輯抽成可注入的純函式以便測試。
- 新增前端 `src/components/GoogleSignInButton.jsx`、`src/pages/NicknameSetupPage.jsx`（新建的 Google 帳號未設暱稱時導向，預設帶 Google 名字，頭像用預設貓咪）。
- 修改 `src/App.jsx`：`LoginScreen` 外部瀏覽器顯示 LINE／Google 兩按鈕（D5：LINE 內不顯示 Google）；路由加入暱稱頁。
- 修改 `src/context/AppContext.jsx`：新增 `loginWithGoogle`，登入後同樣認領訪客名字。
- 新增環境變數 `VITE_GOOGLE_CLIENT_ID`（加入兩個 CI workflow 與 `docs/operations.md`）、後端參數 `GOOGLE_CLIENT_ID`。
- i18n：`zh-TW` 與 `en` 同步新增字串，跑 `npm run check:cjk`。

完成條件：全新的 Google 使用者可登入、設暱稱、建立群組、用邀請連結加入群組、認領訪客名字；LINE 使用者不受影響。

### PR4：合併核心，純函式與資料搬移（L）

後端為主，尚未開放給使用者。

- 新增 `functions/merge.js`（純函式）：衝突分類、`resolutions` 套用、`keepUid` 決定（群組數較多者）、轉帳自付偵測。
- 新增 `functions/merge.test.js`，涵蓋：兩邊都在同一群組、只有一邊在、固定 id 衝突、`resolutions` 各種組合、轉帳變自付。
- 修改 `functions/index.js` 的 `migrateMember`：補轉帳 `from === to` 處理（D3）；新增「以 uid 反查所屬群組」輔助函式。
- 個人資料搬移：以 `listCollections` 遍歷 `users/{dropUid}` 的所有子集合（不寫死集合名稱，P12 的 `transactions` 會自動涵蓋），自動 id 的文件直接搬，固定 id 的文件依 `resolutions`。

完成條件：純函式測試通過；用測試資料手動呼叫搬移函式，結果與預期一致。

### PR5：綁定與合併的 API（L）

- 新增 `bindIdentity`、`previewMerge`、`executeMerge`、`unbindIdentity`（見第 2 節補修）。
- 憑證驗證抽成統一介面 `verifyProof({ provider, ... }) → subject`：Google 走 ID token；LINE 走 `code + redirectUri`（外部瀏覽器）或 LIFF `idToken`（LINE 內）。
- `merges` 狀態機與備份：備份 `dropUid` 資料到 `mergeBackups/{id}`；每步寫回狀態，失敗可重試；`executeMerge` 結束時回傳 `keepUid` 的 custom token。
- 新增排程函式清除超過 30 天的 `mergeBackups`。
- 修改 `detachMember`：刪除帳號時一併刪該 uid 的 `identities`、`merges`、`mergeBackups`。
- 安全：訪客不能呼叫；`executeMerge` 驗證發起人與 `previewed` 紀錄一致且未過期；同一對帳號同時只允許一個進行中的合併。

完成條件：以兩個測試帳號（模擬器或測試專案）完整跑通「綁定」「合併」「失敗後從斷點重試」「備份可還原」。

### PR6：前端綁定與合併介面（L）

- 修改 `src/pages/SettingsPage.jsx`：新增「登入方式」區塊，列出已綁定的 provider、綁定其他方式、解除綁定（至少保留一種）。
- LINE 綁定走 `/auth/callback`，用 `state` 帶 `purpose=bind` 區分；修改 `AuthCallbackPage.jsx` 與 `completeOAuthCallback`。
- 新增 `src/pages/MergeConfirmPage.jsx`：顯示將搬動的群組數與帳目筆數、自動加總的群組、需要決定的衝突（每項帶預設建議值）；確認後呼叫 `executeMerge`，成功後用回傳的 token 重新登入。
- i18n 雙語字串。

完成條件：從 LINE 綁 Google、從 Google 綁 LINE、兩邊都有資料的合併，三種路徑都能在介面上完成。

### PR7：收尾與文件（S）

- 更新 `docs/identity-and-guests.md`、`docs/operations.md`（Google OAuth 用戶端、授權網域、環境變數、備份排程、測試方式）、`docs/architecture.md`、`README.md`。
- 更新 `public/privacy.html`、`public/terms.html`（中英文）：新增 Google 登入、身分對照、合併備份保留 30 天的說明。
- 更新 `docs/superpowers/specs/README.md` 的 P14 狀態。

## 5. 風險與對策

| 風險 | 對策 |
|---|---|
| 合併不可逆 | 備份加 dry-run 加斷點續跑；`executeMerge` 前一律要有 `previewed` 紀錄；第一版以腳本還原，不做一鍵還原 |
| `main` 一合併就上線 | 每個 PR 向下相容；PR1 保留 `userId` 欄位；rules 與前端同 PR |
| 舊 LINE 使用者對照項尚未建立 | 登入時懶建立加上線前補齊腳本；綁定判斷以「`users/{sub}` 是否存在」兜底 |
| 同一個 Google 帳號兩裝置同時首次登入 | `authExchange` 查表與建立放在 transaction，並加並行測試 |
| LINE 內建瀏覽器無法 Google 登入 | 登入畫面不顯示；設定頁仍可綁定，被擋時提示並提供「在外部瀏覽器開啟」（D5） |
| 合併途中使用者被登出 | `executeMerge` 回傳 `keepUid` 的 token，前端自動重新登入 |

## 6. 開工前我需要的確認

D1 到 D5 與 spec 補修皆已確認。唯一待辦：Google OAuth 用戶端 ID 建好後告訴我（PR3 才用到，不急）。可以從 PR1 開工。
