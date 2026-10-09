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
- **LINE 認領**（`claimMember`）：LINE 使用者可認領訪客名字，`migrateMember` 會把該名字在所有支出與轉帳裡的紀錄改成他的 LINE uid，名字從名單消失，之後只有本人能用。訪客自己綁定 LINE 時，瀏覽器記住的名字會一併認領。
- **Rules 限制訪客**：`isLineUser()` 以 `guest` claim 判斷，訪客不能建立群組、加入其他群組、退出群組。虛擬成員 id 以 `p_` 開頭，LINE userId 不含底線，不會撞號；成員新增虛擬成員的規則是 `addsPlaceholder()`。
- 訪客同名（忽略大小寫與全半形）會被拒絕，避免同一人變成兩個成員。
- **LINE 使用者退出**（`detachMember`，退出群組與「刪除我的資料」共用）：反向使用 `migrateMember`，把自己轉成新的訪客名字（沿用原名字、清掉頭像、`placeholder = true`），帳目、餘額、筆數一併轉移，之後別人可認領。建立者退出時先把 `createdBy` 轉給最早加入的 LINE 成員；沒有其他 LINE 成員就整個群組刪除（含 Storage 檔案）。先轉建立者再改帳目，中途失敗重試即可。建立者「移除成員」仍是直接移除，不保留名字。
