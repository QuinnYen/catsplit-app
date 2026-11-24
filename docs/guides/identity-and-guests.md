# 身分與訪客

使用者有兩種身分，Firebase Auth 的 uid 不同：

| | LINE 使用者 | 訪客 |
|---|---|---|
| uid | 內部 uid（`u_` 開頭，與 LINE userId 無關） | `p_` 開頭的成員 id |
| 取得方式 | `lineLogin`（外部瀏覽器）或 `verifyLiffToken`（LINE 內）發 custom token | `guestLogin` 發 custom token，帶 `guest: true` claim |
| 能做什麼 | 建立、加入、退出群組 | 只能使用自己那個名字所在的群組 |

訪客的設計重點：

- **名字不鎖定**：訪客在邀請連結輸入名字，群組裡就多一位成員（`memberProfiles[id].placeholder = true`）。任何拿到連結的人都能選用既有名字，清快取或換裝置後再點一次就回來，不需要保管任何憑證。創群者也可以在「編輯群組」先新增名字。
- **不使用 Firebase 匿名登入**：匿名帳號的憑證只存在瀏覽器，清快取就失去身分，Auth 的匿名帳號自動清除也會依建立時間刪掉還在使用的人。
- **一次一個身分，最多 3 個群組**：瀏覽器把選過的名字記在 localStorage（`catsplit_guest_names`），進入其他群組時自動重新取得該群組的 token 切換。超過 3 個要求用 LINE 登入。
- **LINE 認領**（`claimMember`）：LINE 使用者可認領訪客名字，`migrateMember` 會把該名字在所有支出、收入與轉帳裡的紀錄改成他的 LINE uid，名字從名單消失，之後只有本人能用。訪客自己綁定 LINE 時，瀏覽器記住的名字會一併認領。
- **Rules 限制訪客**：`isMember()`（原名 `isLineUser()`，語意是「非訪客」）以 `guest` claim 判斷，訪客不能建立群組、加入其他群組、退出群組。虛擬成員 id 以 `p_` 開頭，LINE userId 不含底線，不會撞號；成員新增虛擬成員的規則是 `addsPlaceholder()`。
- 訪客同名（忽略大小寫與全半形）會被拒絕，避免同一人變成兩個成員。
- **LINE 使用者退出**（`detachMember`，退出群組與「刪除我的資料」共用）：反向使用 `migrateMember`，把自己轉成新的訪客名字（沿用原名字、清掉頭像、`placeholder = true`），帳目、餘額、筆數一併轉移，之後別人可認領。建立者退出時先把 `createdBy` 轉給最早加入的 LINE 成員；沒有其他 LINE 成員就整個群組刪除（含 Storage 檔案）。先轉建立者再改帳目，中途失敗重試即可。「刪除我的資料」最後還會刪掉 Auth 紀錄（`deleteAccount`），順序是：只有自己的群組 → 收款方式 → 退出群組 → 刪 Auth，任何一步失敗都不會刪 Auth，重試即可。建立者「移除成員」仍是直接移除，不保留名字。

## 身分對照表 `identities`（P14 進行中）

設計見 [P14 設計](../superpowers/archive/2026-11-14-p14-identity-design.md)，實作順序見[實作計畫](../superpowers/archive/2026-11-23-p14-identity-plan.md)。目的是讓 uid 不再等於 LINE userId，之後才能新增 Google 登入、帳號綁定與合併，並能脫離 LINE。

- 集合 `identities/{provider:subject}` → `{ uid, provider, subject, createdAt }`，例如 `identities/line:U1234…`。只有雲端函式（Admin SDK）讀寫，rules 全拒（`merges`、`mergeBackups` 同）。
- **目前**：`lineLogin`、`verifyLiffToken` 登入時在 transaction 內查表；有對照項就用它的 uid，**沒有就是全新的使用者**，用新的內部 uid（`u_` 開頭）並建立對照項。**正式環境已經沒有以 LINE userId 當 uid 的帳號**：既有的 6 位舊使用者已於 2026-11-23 轉成 `u_`（一次性遷移，程式已移除，見 `operations.md`「已完成的一次性遷移」）。回應新增 `uid`，仍保留 `userId`（LINE userId）。前端以回應的 `uid` 為準，本機快取的使用者另存 `lineUserId`，只用來確認目前的 LIFF 使用者沒被換掉（見 `src/utils/authSession.js`）；快取沒有 `lineUserId` 時不走快速路徑，重新登入一次就會補上。
- 內部 uid 格式為 `u_` 加 20 位十六進位（`functions/identity.js` 的 `makeUid`），所有新帳號（Google、LINE）使用。
- **Google 登入（PR3）**：登入畫面（外部瀏覽器）顯示 Google 按鈕，前端用 Google Identity Services 取得 ID token，`authExchange` 驗證後以 `identities/google:{sub}` 查表；沒有就建立新的內部 uid 與對照項（transaction，並行首次登入只會有一個 uid）並建立 `users/{uid}`（`provider: 'google'`）。Google 帳號的 `user.provider` 為 `'google'`，LINE 使用者沒有這個欄位。
- **首次設定暱稱**：Google 帳號沒有 LINE 名字可當預設，所以雲端還沒有暱稱時，登入後先進「設定顯示名稱」頁（預設帶 Google 名字，最多 20 字），完成才進首頁；設定頁的暱稱也不能清空。LINE 使用者不經過這一頁。
- **名稱、頭像、provider**：每個登入方式各存一份（`users/{uid}.names`、`avatars` 的 `line`、`google`），登入時只更新自己那一份；顯示用的 `name`、`avatar` 由 `functions/profile.js` 決定：**LINE 優先，沒有才用 Google**，頭像都沒有就是 `null`（畫面顯示名字首字）。`provider` 只在「沒有 LINE 名字可退回」時才是 `'google'`（用來要求首次設定暱稱），有 LINE 名字就是 `null`，所以已綁定 LINE 的帳號用 Google 登入，不會被當成 Google 使用者、也不用重設暱稱。不讓「最後登入的方式」決定，否則同一個人換裝置登入，名稱與頭像（包含群組裡其他成員看到的）會一直跳。舊資料沒有 `names` / `avatars`，`provider` 不是 `google` 的既有 `name`、`avatar` 視為 LINE 的。Google 頭像只存網址，不另存圖片，網址失效時畫面退回名字首字。合併時兩邊各登入方式的資料取聯集寫回保留帳號（同一種以保留帳號為準）。`authExchange` 回應的 `displayName` 仍是 Google 上的名字（首次設定暱稱的預設），`name`、`avatar`、`provider` 才是帳號實際的。
- **還沒做的**：隱私權政策與服務條款補上 Google 登入、身分對照與合併備份的說明，以及 Apple 登入（PR7 與後續）。
- **合併核心（PR4，尚未開放，沒有任何端點）**：`functions/merge.js`（純函式）與 `functions/memberOps.js`（Firestore 操作）。重點：
  - 保留哪個 uid 由系統決定：群組較多者保留，一樣多保留第一個參數；訪客（`p_`）與相同 uid 不能合併。
  - 兩邊都在同一群組：金額、餘額相加；**筆數改由搬移後的支出文件重算**（兩個帳號可能參與同一筆支出，直接相加會重複）。只有被併入帳號在的群組：成員身分直接改成保留帳號。
  - 合併後變成「自己轉給自己」的轉帳會被刪除；轉帳對餘額是對沖，淨效果為 0，不影響任何餘額。
  - 個人資料以 `listCollections` 遍歷 `users/{uid}` 底下所有子集合（不寫死集合名稱）。收款方式、付款方式、儲蓄目標都是自動 id，直接複製；只有固定 id 的文件（暱稱 `settings/profile`、`settings/oaPrompt`，以及 P12 的 `group_{groupId}`）會衝突：`settings/oaPrompt` 自動保留較新的，其他由使用者決定（預設保留 keepUid 的；不用「較新」，因為剛建立的新帳號資料一定較新，會預設刪掉用了很久的帳號）。
  - 先全部複製、再刪來源，可以重試：已複製的文件在重試時視為「保留」，資料相同。`users/{uid}` 本身不搬，合併最後與 Auth 一起刪。
- **刪除我的資料**會一併刪掉該 uid 的 `identities`（見 `docs/guides/operations.md`）。

### 綁定與合併的端點（PR5，前端入口在 PR6）

除了 `redeemLinkCode` 之外，全部要求登入且不是訪客（訪客一律 401），失敗回 `{ error }` 與對應的 HTTP 狀態。

| 端點 | 用途 |
|---|---|
| `listIdentities` | 列出自己已綁定的登入方式 `[{ id, provider, createdAtMs }]` |
| `bindIdentity` | 綁定第二種登入方式；`{ provider: 'google', idToken }`、`{ provider: 'line', code, redirectUri }`（外部瀏覽器）或 `{ provider: 'line', liffIdToken }`（LINE 內） |
| `executeMerge` | 確認並執行合併，`{ mergeId, resolutions? }`，可重試 |
| `unbindIdentity` | 解除一個登入方式，`{ identityId }` |
| `createLinkCode` | 在 LINE 內產生一次性連結碼（5 分鐘、單次），回傳 `{ code, expiresAtMs }` |
| `redeemLinkCode` | 在外部瀏覽器兌換連結碼，**不需要登入**，`{ code }`，回傳該帳號的 `firebaseToken` 與 `profile` |

- **`bindIdentity` 的結果**：`bound`（新增一筆對照項）、`already_bound`，或 `merge_required` 加預覽（`mergeId`、`initiatorIsDropped`、受影響的群組、帳目筆數、自己轉給自己的轉帳數、個人資料衝突與預設建議、`expiresAtMs`）。驗證與預覽在同一次呼叫完成（LINE 授權碼只能用一次）。
- **憑證驗證**：Google ID token 簽發後 10 分鐘內才接受；LINE 授權碼的 `redirectUri` 必須是我們網域的 `/auth/callback`。LINE 內的 `liffIdToken` 沿用 LINE 驗證端點的有效期。
- **判斷要不要合併**（`functions/bind.js` 的 `decideBind`）：對照表已有且是自己 → `already_bound`；已有但是別的帳號 → 合併；對照表沒有 → 新增一筆對照項指向呼叫者。
- **保留哪個**：群組較多的帳號保留（一樣多保留發起人）。若發起人是被併入而刪除的那個帳號，`executeMerge` 回傳保留帳號的 `firebaseToken` 與 `sessionReplaced: true`，前端要用它重新登入。
- **分階段與重試**：`previewed → started → groups_done → profile_done → done`，進度存 `merges/{id}`（同一對帳號固定同一份）。失敗時用同一個 `mergeId` 再呼叫即可從斷點繼續；同時執行兩次會被租約擋下（409）。
- **備份**：動資料前先備份到 `mergeBackups/{mergeId}`（meta 加子集合 `groupDocs`、`personal`、`keepOverwritten`），保留 30 天，由 GitHub Actions 每天清除。**目前沒有一鍵還原**，要還原就依備份內容用腳本寫回（`groupDocs` 的每筆有 `groupId`、`col`、`docId`、`data`；`personal` 的每筆有 `path` 與 `data`；meta 的 `dropIdentities` 與 `dropUserDoc` 是被併入帳號的對照項與 `users` 文件）。
- **登入**：`verifyLiffToken`、`lineLogin` 查對照表失敗時直接回 500，不會另外給一個 uid（合併後對照項可能指向別的 uid，亂給會登入到錯的帳號）。
- **刪除我的資料**（`detachMember` 的 `deleteAccount`）會一併刪掉該 uid 的對照項、牽涉到它的 `merges` 與 `mergeBackups`（備份裡有被併入帳號的資料）。

### 前端（PR6）

- **設定頁「登入方式」**（`src/components/LoginMethodsCard.jsx`，訪客不顯示）：列出已綁定的登入方式與綁定日期；兩種以上才顯示「解除綁定」（至少保留一種）；還沒綁的才提供新增。
  - **綁定 Google**：外部瀏覽器用 Google 官方按鈕，取得 ID token 後呼叫 `bindIdentity`。**LINE 內建瀏覽器改走「帶著登入狀態到外部瀏覽器」**（見下方），因為 Google 不允許在內嵌 WebView 登入。
  - **綁定 LINE**：只在外部瀏覽器提供（LINE 內建瀏覽器登入的就是 LINE，沒有可綁的）。`startLineBind` 在 localStorage 記下用途 `bind` 後跳到 LINE 授權；回到 `/auth/callback` 時 `completeOAuthCallback` 看到用途是 `bind`，用目前的 Firebase 登入加授權碼呼叫 `bindIdentity`，不會換掉登入帳號。
  - 綁定的結果：`bound` 或 `already_bound` 就更新清單並顯示提示；`merge_required` 就把預覽存進 localStorage（`catsplit_merge_preview`，10 分鐘過期，因為 LINE 授權會整頁跳轉）並導向 `/merge`。
- **合併確認頁**（`/merge`，`src/pages/MergePage.jsx`）：顯示合併內容（兩邊都在與只有一邊在的群組數、會更新的帳目筆數、會被刪除的自付轉帳、搬移的個人資料筆數）、需要使用者決定的衝突（目前只有暱稱，顯示兩邊各是什麼，預設選保留的帳號，也就是群組較多的那個）、無法復原的警告。使用者選的是「目前登入的帳號」或「另一個帳號」，送出前換成雲端函式要的 `keep` / `drop`（發起人被併入時，發起人對應 `drop`，見 `src/utils/mergeUi.js`）。
- **合併完成後**（`completeMerge`）：若原本的登入帳號被併入而刪除（`sessionReplaced`），用回傳的 token 重新登入保留帳號，並以回傳的 `profile`（名稱、頭像、登入方式）重建本機的使用者資料，再整頁重新載入到 `/settings?merged=1`，讓暱稱、群組等狀態都以合併後的帳號為準。
- **錯誤處理**：雲端函式的錯誤碼對到畫面訊息（`mergeErrorKey`）。部分群組失敗、上一次還在執行等情況保留預覽，使用者再按一次「確認合併」會從斷點繼續；預覽逾時或找不到才清掉預覽。
- 純函式與 API 呼叫抽在 `src/utils/mergeUi.js`、`src/utils/identityApi.js`，都有單元測試。

### LINE 內綁定 Google：帶著登入狀態到外部瀏覽器

LINE 內建瀏覽器是內嵌 WebView：有獨立的儲存空間，看不到手機瀏覽器或系統已登入的 Google 帳號；Google 也不允許在內嵌 WebView 登入（標準授權會直接 `403: disallowed_useragent`，Google 登入按鈕的彈出視窗則停在 Google 的 `accounts.google.com/transform` 頁面，憑證傳不回我們的頁面，實測 Android 就是這樣）。所以 LINE 內的設定頁不放 Google 按鈕，改成：

1. 在 LINE 內按「用 Google 綁定」→ `createLinkCode` 產生一次性連結碼，**畫面上先顯示連結**（`/link#code=…`）→ 使用者按「複製連結」（或長按連結欄位選取），貼到手機的任何瀏覽器（不限 Chrome）網址列開啟。**不提供自動開啟**：實測 `liff.openWindow({ external: true })` 與 `openExternalBrowser=1` 在 Android 的 LINE 內都沒反應，連匯出 CSV 的外部開啟也一樣。
2. 外部瀏覽器的 `/link` 頁（`src/pages/LinkPage.jsx`）呼叫 `redeemLinkCode`（**不需要登入**，碼本身就是憑證）兌換成同一個帳號的 custom token，登入後立刻把碼從網址與瀏覽紀錄移除，導到 `/settings?link=1`。
3. 設定頁提示「已用你的 LINE 帳號登入，請按下方的 Google 按鈕」，用 Google 帳號完成綁定（瀏覽器若已登入 Google 按一下即可，沒登入就登入一次；之後與一般的 `bindIdentity`、合併流程相同，都在外部瀏覽器完成）。
4. 切回 LINE 時，設定頁會在頁面重新可見時重新讀取清單，看到新綁定的 Google。

連結碼的設計（`functions/linkCode.js`、`functions/linkFlow.js`）：
- 256 位元隨機（43 個 base64url 字元），資料庫 `linkCodes/{sha256(碼)}` **只存雜湊**，只有雲端函式能讀寫（rules 全拒）。
- **5 分鐘內有效、只能兌換一次**（兌換時在 transaction 內刪除紀錄；同時兌換多次只有一次成功）。同一個帳號同時只留一個有效的碼，產生新的舊的就失效。
- 碼放在網址的 `#` 後面：不會被送到伺服器，也不會出現在 Referer；`/link` 頁讀完立刻用 `replaceState` 移除。若 `#` 被某些瀏覽器丟掉，頁面也接受 `?code=` 當備援。
- 兌換時若帳號已不存在（`users` 文件被刪，例如剛被合併掉）一律當作無效，不會用這個 uid 建出空帳號。
- 錯誤：`link_invalid`（不存在、已兌換、格式不對，404）、`link_expired`（逾時，410）。
- 這等於「把已登入的狀態交給外部瀏覽器」。風險是連結在 5 分鐘內被別人先用掉；因為連結是在使用者自己的手機上直接開啟、單次有效，視為可接受。
- 刪除我的資料會一併刪掉該帳號未兌換的連結碼；清除排程（`purge-merge-backups.yml`）也涵蓋過期的連結碼。

**實測結果與修正**：第一版（PR7）按下按鈕後直接 `openWindow`，在 Android 實測**瀏覽器沒有開啟，畫面一直停在「處理中…」**，而且看不出卡在哪一步；`liff.openWindow` 的 `external` 行為依 LINE 版本、機型而異（專案裡也已有註解提到三星雙開 LINE 會被導回主 LINE），沙盒連不到 LINE 文件，沒能確認確切原因。所以改成：
- 所有身分相關的 API 呼叫加上 20 秒逾時（`src/utils/identityApi.js`），不會永遠等待，逾時顯示網路錯誤並可重試。
- 流程分兩步，每一步畫面都看得到；連結逾時 5 分鐘會提示並回到第一步。
- 最後移除所有自動開啟的按鈕，只留「複製連結」，不依賴 LINE 能開外部瀏覽器。

