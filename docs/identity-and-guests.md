# 身分與訪客

使用者有兩種身分，Firebase Auth 的 uid 不同：

| | LINE 使用者 | 訪客 |
|---|---|---|
| uid | LINE userId | `p_` 開頭的成員 id |
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

設計見 [P14 設計](superpowers/specs/2026-11-14-p14-identity-design.md)，實作順序見[實作計畫](superpowers/plans/2026-11-23-p14-identity-plan.md)。目的是讓 uid 不再等於 LINE userId，之後才能新增 Google 登入、帳號綁定與合併，並能脫離 LINE。

- 集合 `identities/{provider:subject}` → `{ uid, provider, subject, createdAt }`，例如 `identities/line:U1234…`。只有雲端函式（Admin SDK）讀寫，rules 全拒（`merges`、`mergeBackups` 同）。
- **目前（PR1）**：`lineLogin`、`verifyLiffToken` 登入時在 transaction 內查表；沒有對照項就沿用 LINE userId 當 uid 並建立對照項（懶建立）。所以現有與新的 LINE 使用者的 uid 都仍是 LINE userId，資料不用搬。回應新增 `uid`，仍保留 `userId`（LINE userId）。前端（PR2）以回應的 `uid` 為準，本機快取的使用者另存 `lineUserId`，只用來確認目前的 LIFF 使用者沒被換掉（見 `src/utils/authSession.js`）；舊版快取沒有 `lineUserId` 時以 `uid` 代替，現有使用者不需重新登入。查表失敗時退回 LINE userId，讓登入照常；帳號合併上線後必須拿掉這個退路。
- 內部 uid 格式為 `u_` 加 20 位十六進位（`functions/identity.js` 的 `makeUid`），Google 登入的新帳號使用。
- **Google 登入（PR3）**：登入畫面（外部瀏覽器）顯示 Google 按鈕，前端用 Google Identity Services 取得 ID token，`authExchange` 驗證後以 `identities/google:{sub}` 查表；沒有就建立新的內部 uid 與對照項（transaction，並行首次登入只會有一個 uid）並建立 `users/{uid}`（`provider: 'google'`）。Google 帳號的 `user.provider` 為 `'google'`，LINE 使用者沒有這個欄位。
- **首次設定暱稱**：Google 帳號沒有 LINE 名字可當預設，所以雲端還沒有暱稱時，登入後先進「設定顯示名稱」頁（預設帶 Google 名字，最多 20 字），完成才進首頁；設定頁的暱稱也不能清空。LINE 使用者不經過這一頁。
- **頭像**：Google 帳號的頭像一律是 `null`（畫面顯示名字首字），不存 Google 頭像網址。預設貓咪頭像之後再調整。
- **還沒做的**：LINE 與 Google 互相綁定、帳號合併（PR5、PR6）。目前同一個人用 LINE 與 Google 登入會是兩個獨立帳號。
- **刪除我的資料**會一併刪掉該 uid 的 `identities`（見 `docs/operations.md`）。
- **補齊現有使用者**：`functions/scripts/backfill-identities.mjs` 掃描 `users/` 與群組 `members`，為缺對照項的 LINE 使用者補上。預設只列出（dry-run），加 `--apply` 才寫入，可重複執行。帳號綁定與合併上線前必須先跑過一次。
