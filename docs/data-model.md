# 資料模型

日期：2026-11-23。依 `firestore.rules`、`storage.rules`、`src/`、`functions/` 的實際程式盤點，**描述現況**；「分析」與「待決議」是提案，不是已決定的事。改動資料結構時請同步更新本文件。

相關文件：身分與帳號合併見 [`identity-and-guests.md`](identity-and-guests.md)，架構見 [`architecture.md`](architecture.md)，個人記帳設計見 `superpowers/specs/2026-11-14-p12-personal-ledger-design.md`。

## 1. 身分（uid）

所有資料的主鍵是 Firebase Auth 的 uid，目前有三種格式：

| 格式 | 誰 | 說明 |
|---|---|---|
| `U` + 32 位十六進位 | 舊 LINE 使用者（**待轉移**） | uid 就是 LINE userId（歷史包袱）。2026-11-23 起全新的 LINE 使用者不再拿到這種 uid；舊使用者用一次性工具轉成 `u_`（見 `operations.md`「舊 LINE uid 轉成內部 uid」），全部轉完後這種格式就不存在了 |
| `u_` + 20 位十六進位 | 新帳號（Google、新的 LINE 使用者、合併後解除綁定的新帳號、轉移後的舊 LINE 使用者） | 內部 uid，與任何登入方式無關 |
| `p_` + 20 位隨機字元 | 訪客（虛擬成員） | 只存在於群組的 `members`、`memberProfiles` 與帳目裡，由群組成員新增；訪客登入後的 Auth uid 也是這個 id。LINE userId 與內部 uid 都不含 `p_` 開頭，rules 靠這點分辨 |

「這個 uid 是誰、用什麼登入」由 `identities` 對照表記錄（見下）。

## 2. Firestore 集合總覽

| 路徑 | 用途 | 客戶端讀 | 客戶端寫 | 後端寫 |
|---|---|---|---|---|
| `identities/{provider:subject}` | 登入身分對應到哪個 uid | 否 | 否 | 是 |
| `merges/{id}` | 帳號合併的進度與預覽 | 否 | 否 | 是 |
| `mergeBackups/{id}` | 合併前的備份，30 天後清除 | 否 | 否 | 是 |
| `linkCodes/{id}` | LINE 內一次性連結碼（只存雜湊），5 分鐘 | 否 | 否 | 是 |
| `users/{uid}` | 使用者的名稱、頭像、登入方式（顯示用快取） | **否**（rules 沒有開放） | 否 | 是 |
| `users/{uid}/settings/profile` | 全域暱稱 | 本人 | 本人（非訪客） | 合併時搬移 |
| `users/{uid}/settings/oaPrompt` | 官方帳號加好友提示旗標 | 本人 | 本人 | 合併時搬移 |
| `users/{uid}/paymentMethods/{auto}` | 收款方式 | 本人；公開的（`isPublic`）任何登入者 | 本人（非訪客） | — |
| `users/{uid}/spendMethods/{auto}` | 付款方式（信用卡等，記帳時選用） | 本人 | 本人（非訪客） | — |
| `users/{uid}/savingsGoals/{auto}` | 儲蓄目標 | 本人 | 本人（非訪客） | — |
| `users/{uid}/savingsGoals/{id}/entries/{auto}` | 存提款紀錄 | 本人 | 本人（非訪客） | — |
| `groups/{auto}` | 群組 | 見下 | 見下 | 搬移成員、刪除成員 |
| `groups/{id}/expenses/{auto}` | 支出 | 群組成員 | 群組成員 | 搬移成員 |
| `groups/{id}/incomes/{auto}` | 收入與贊助 | 群組成員 | 群組成員 | 搬移成員 |
| `groups/{id}/settlements/{auto}` | 轉帳（還款）紀錄 | 群組成員 | 群組成員 | 搬移成員 |

「{auto}」是 Firestore 自動產生的文件 id。`users/{uid}` 底下沒有 rules 的路徑一律拒絕。

### 2.1 `identities/{provider:subject}`

| 欄位 | 說明 |
|---|---|
| `uid` | 對應的內部 uid |
| `provider` | `line` 或 `google` |
| `subject` | 該提供者給的帳號識別碼（LINE userId、Google `sub`），不能用 email |
| `createdAt` | 建立時間 |
| `mergedFrom`、`createdByMerge` | 合併時改指向或補建才有 |

文件 id 是 `provider:subject`，所以查「這個 LINE 帳號是誰」是單次讀取。反向（「這個 uid 綁了哪些登入」）用 `where('uid', '==', uid)`。

### 2.2 `users/{uid}`（顯示用快取，只有後端能碰）

| 欄位 | 說明 |
|---|---|
| `names.line`、`names.google` | 各登入方式取得的名稱 |
| `avatars.line`、`avatars.google` | 各登入方式取得的頭像網址（只收 https） |
| `name`、`avatar` | 顯示用，規則 LINE 優先、沒有才用 Google（`functions/profile.js`） |
| `provider` | 只在沒有 LINE 名字可退回時是 `google`，否則 `null`（用來要求首次設定暱稱） |
| `updatedAt` | 最後登入同步時間 |

舊資料可能沒有 `names`、`avatars`，只有 `name`、`avatar`（視為 LINE 的）。客戶端讀不到這份文件，所以兌換連結碼、合併完成後，名稱與頭像是由後端回應帶回去的。

### 2.3 `users/{uid}/…` 個人資料

| 集合 | 欄位 |
|---|---|
| `settings/profile` | `nickname`（1 到 20 字，rules 限制只能有這一個欄位） |
| `settings/oaPrompt` | `promptedAt`（timestamp） |
| `paymentMethods` | `providerId`、`value`（1 到 200 字）、`isPublic`、`createdAt` |
| `spendMethods` | `name`（1 到 20 字）、`type`（`cash`、`credit`、`mobile`、`debit`、`emoney`、`transit`）、`createdAt` |
| `savingsGoals` | `title`（1 到 50 字）、`targetAmount`、`currency`、`targetDate`（字串或 null）、`createdAt` |
| `savingsGoals/{id}/entries` | `type`（`save`、`withdraw`）、`amount`、`title`、`date`（字串）、`createdAt` |

只有**固定 id** 的文件（`settings/profile`、`settings/oaPrompt`）在帳號合併時會 id 衝突；其他都是自動 id，直接搬移。

### 2.4 `groups/{id}`

| 欄位 | 說明 |
|---|---|
| `name`、`icon`、`iconColor`、`coverUrl` | 群組外觀；`coverUrl` 指向 Storage |
| `createdBy` | 建立者 uid，不可改；只有建立者能刪除群組、改預算、移除他人 |
| `members` | uid 陣列（含訪客 id），上限 50。是首頁查詢 `array-contains` 與 rules `isMemberOf` 的依據 |
| `memberProfiles` | `{ uid: { name, avatar, placeholder? } }`，**冗餘複本**，見 3.1 |
| `baseCurrency` | 群組基準幣別，帳目的 `amount` 都換算成這個幣別 |
| `homeCurrency` | 選填，母國幣，僅供參考換算 |
| `budget` | 選填，`{ amount, period: { type } }`，rules 有驗證形狀 |
| `archived` | 選填，是否封存 |
| `createdAt` | 建立時間 |
| `totalAmount`、`totalExpenses` | **彙總**：支出總額與筆數 |
| `totalIncome`、`incomeCount` | **彙總**：收入總額與筆數（贊助不計入） |
| `memberBalances` | **彙總**：`{ uid: 餘額 }`，正數代表別人欠他 |
| `memberExpenseCounts` | **彙總**：`{ uid: 參與分攤的支出筆數 }` |

存取規則：

- 單筆讀取：任何登入者（持有群組 id 即可看到，因為加入前要先看到名稱，見邀請連結）。
- 列表查詢：只能列出 `members` 含自己的群組。
- 建立：必須是非訪客，`members` 只有自己。
- 更新：成員可更新（不能改 `createdBy`；`budget` 只有建立者能改；成員名單一次只能少一人，本人退出或建立者移除）；非成員只能把自己加進去；成員可新增一位虛擬成員（`p_…`）。
- 刪除：只有建立者。刪除群組一律由後端處理（`deleteGroup` 端點，建立者才能呼叫；`detachMember` 對只有自己的群組也走同一個 `deleteGroupCompletely`），用 `recursiveDelete` 刪子集合與群組文件，並刪 Storage 的收據與封面。rules 仍保留「建立者可刪」，只是為了新舊版本部署期間相容，客戶端已不再直接刪。

### 2.5 `groups/{id}/expenses`、`incomes`、`settlements`

**expenses（支出）**

| 欄位 | 說明 |
|---|---|
| `title`、`category`、`note` | 內容 |
| `currency`、`originalAmount`、`exchangeRate` | 原幣別、原幣金額、對群組基準幣的匯率 |
| `amount` | 換算成群組基準幣後的總額 |
| `homeCurrency`、`homeRate` | 選填，記帳當下的母國幣匯率快照 |
| `payments` | `{ uid: 金額 }`，付款人與各自出資（基準幣） |
| `paymentMethod`、`paymentNote` | 付款方式類型與備註 |
| `splitType` | `equal`、`subset`、`shares`、`percentage`、`custom` |
| `splits` | `{ uid: 金額 }`，各人應分攤（基準幣） |
| `shares` | 選填，份數分帳時各人的份數 |
| `createdBy` | 記帳的人 |
| `createdAt` | **消費時間**（使用者可改；排序與月份篩選用它） |
| `hasTime` | 是否有真實時間（舊資料只有日期） |
| `addedAt` | 實際新增的時間 |
| `receiptPath` | 選填，收據在 Storage 的路徑 |

**incomes（收入、贊助）**：同支出，但付款欄位叫 `received`，另有 `isSponsorship`（贊助只動餘額，不算收入）。

**settlements（轉帳）**：`from`、`to`、`amount`、`currency`、`originalAmount?`、`exchangeRate?`、`paymentMethod`、`note`、`settledBy`、`settledAt`、`createdAt`。

## 3. 冗餘資料與一致性

這是資料模型裡最需要留意的部分：同一個事實存在多處，由誰維護、怎麼修復要說清楚。

### 3.1 冗餘清單

| 冗餘資料 | 真正來源 | 誰維護 | 可能的漂移 | 修復手段 |
|---|---|---|---|---|
| `groups.memberProfiles[uid].name、avatar` | 使用者的暱稱（`settings/profile`）與 `users/{uid}` | **各人的前端**登入時同步到自己所在的每個群組（`useSyncMemberProfile`）；加入時寫入一份 | 使用者換暱稱後沒開 App，別人看到的還是舊的；訪客與已退出者沒有來源 | 使用者再開 App 就會同步；沒有後端修復 |
| `groups.memberBalances`、`memberExpenseCounts`、`totalAmount`、`totalExpenses`、`totalIncome`、`incomeCount` | 三個子集合的全部帳目 | **客戶端**：新增時在同一個 batch 用 `increment` 更新；編輯與刪除時用 `recomputeGroupAggregates`（交易內重讀全部帳目並重算） | 新增靠「增量」，與重算的結果理論上相同；歷史上合併時出過 `memberExpenseCounts` 重複計算的 bug | 客戶端 `recomputeGroupAggregates`（任何編輯或刪除會觸發）；**維運工具** `functions/scripts/check-aggregates.mjs`（GitHub Actions「Check group aggregates」，dry-run 列出差異、`--apply` 寫回，見 `operations.md`） |
| `users/{uid}.name、avatar、provider` | `names`、`avatars`、各登入方式 | 後端每次登入 | 規則固定，不應漂移 | 下次登入自動校正 |
| 帳目裡的 `exchangeRate`、`homeRate` | 當時的匯率 | 記帳時寫入 | 刻意保存的快照，不是漂移 | — |

### 3.2 設計上的特徵與限制

- **餘額是增量寫入，不是每次重算。** 好處是新增帳目只動一個文件；風險是增量邏輯與重算邏輯必須永遠一致（`computeMemberBalances`）。
- **轉帳（settlements）只更新 `memberBalances`**，不動其他彙總。
- **名稱有兩個地方**：`users/{uid}.name`（後端、顯示用快取，客戶端讀不到）與 `settings/profile.nickname`（客戶端可寫的暱稱）。畫面上的名稱 = 暱稱優先，否則 `users.name`；`users/{uid}.name` 實際上只用在後端回應（兌換連結碼、合併完成）。
- **成員的歷史名稱存在帳目裡嗎？** 沒有：帳目只存 uid，名稱靠 `memberProfiles` 查。成員退出時，後端把他轉成群組內的訪客名字（`placeholder`），帳目 uid 跟著改，才不會變成找不到名字。
- **LINE userId 當 uid 的包袱**：舊使用者 uid 是 `U…`，所以程式不能假設「uid 看得出登入方式」，必須查 `identities`。

## 4. Cloud Storage

| 路徑 | 內容 | 讀 | 寫 | 清理 |
|---|---|---|---|---|
| `receipts/{groupId}/{expenseId}/{file}` | 支出收據照片，5 MB 內，圖片 | 群組成員 | 群組成員 | 刪除群組時由客戶端或後端刪整個前綴 |
| `groups/{groupId}/cover/{file}` | 群組封面，2 MB 內，圖片 | 群組成員 | 群組成員 | 同上 |
| `exports/{groupId}/{random}.csv` | LINE 內匯出 CSV 用的暫存檔 | 簽名網址 | 後端 | bucket 生命週期規則 1 天後刪除 |

## 5. 查詢與索引

| 查詢 | 位置 | 說明 |
|---|---|---|
| `groups where members array-contains uid order by createdAt desc` | 首頁、設定頁 | 需要複合索引 |
| `groups/{id}/{expenses,incomes,settlements} order by createdAt desc`，加月份範圍 `createdAt >=、<` | 群組頁 | 單一欄位範圍加排序，內建索引即可；「全部」會載入整個子集合 |
| 各子集合 `order by createdAt limit 1` | 群組頁 | 取得最早與最晚月份 |
| `users/{uid}/paymentMethods where isPublic == true` | 轉帳頁 | 看對方的公開收款方式 |
| `identities where uid == uid` | 後端（合併、刪除、列出） | 反查 |
| `groups where members array-contains uid` | 後端（合併、退出） | 反查成員所在群組 |

複合索引定義放在 `firestore.indexes.json`（2026-11-23 起進版本控制，目前只有首頁那一條）。**CI 的部署指令沒有包含 `firestore:indexes`**（避免部署帳號權限不足時連帶讓函式部署失敗），新增或修改索引要手動部署：`firebase deploy --only firestore:indexes --project catsplit-app`。部署只會建立檔案裡有的索引，不會刪掉主控台已存在的其他索引（非互動模式不會自動刪除，要刪需另外加 `--force`）。

## 6. 分析：資料量變大時會發生什麼（推論，未實測）

目前的規模很小（補齊身分時 LINE 使用者 6 位），以下是依程式結構的推論，不是量測結果。

| 面向 | 目前做法 | 規模變大的影響 |
|---|---|---|
| 首頁 | 單一查詢列出自己的群組，即時訂閱 | 群組數多時每個群組文件都會被讀；群組文件內含完整 `memberProfiles` 與彙總，單份不大（成員上限 50）。影響與「自己的群組數」成正比，與全站用戶數無關 |
| 群組頁 | 依月份範圍載入帳目 | 單月帳目多沒問題；選「全部」會載入整個群組歷史 |
| 編輯、刪除帳目 | `recomputeGroupAggregates` 讀取三個子集合**全部**文件 | 單次成本與該群組歷史帳目數成正比；活躍的長期群組會越來越貴、越來越慢 |
| 同步名稱頭像 | 每個人在登入時寫入自己所在的每個群組 | 寫入量與「自己的群組數」成正比，每次改暱稱都會觸發 |
| 刪除群組 | 後端 `recursiveDelete`（2026-11-23 起；原本客戶端用單一 `writeBatch`，帳目超過約 499 筆會刪不掉） | 已沒有 500 筆上限。已用 600 筆帳目的群組在模擬器實測刪除成功 |
| 帳號合併、刪除我的資料 | 後端掃 `groups where members array-contains` 再逐一搬移 | 與自己的群組數、帳目數成正比，有 Cloud Functions 逾時風險（合併已分階段可重試） |
| 個人記帳（P12，未做） | 規劃 `users/{uid}/transactions`，一人一個集合 | **每個使用者都會產生無上限成長的集合**，且要與群組帳目互通（快照）。如果沿用「在父文件放彙總」的做法，會重複 3.2 的風險，而且個人帳目數遠大於群組帳目數 |

## 7. 待決議（提案，尚未決定）

依重要性排序，每項都可以獨立決定與執行。

1. ~~把複合索引放進版本控制~~ 已完成（2026-11-23）。檔案內容依程式裡的查詢寫成，尚未與主控台現有索引逐一比對；要比對可執行 `firebase firestore:indexes --project catsplit-app` 匯出現有索引。
2. ~~彙總的整批重算與檢查工具~~ 已完成（2026-11-23），做成 GitHub Actions 維運工具而不是後端端點：不新增對外的權限面，且與 App 共用同一份重算函式。
3. **P12 資料結構先設計再動手**：決定
   - 個人帳目是否與群組帳目共用同一套欄位（`payments`、`splits` 是群組專用，個人帳目只需要單一金額）。
   - 彙總要不要存（建議個人帳目的月總額用查詢計算，或另存**每月一份**的小文件，不要放在一個持續成長的父文件）。
   - 與群組帳目互通用「快照」還是「參照」。
4. **名稱的單一來源**：決定 `users/{uid}.name` 與 `settings/profile.nickname` 的分工，以及是否讓 `memberProfiles` 繼續由客戶端寫。
5. **`memberProfiles` 的更新方式**：如果要降低「各人前端寫每個群組」的成本，可改成後端在名稱變更時觸發；代價是多一個後端函式。
6. ~~刪除群組統一走後端~~ 已完成（2026-11-23）。
7. ~~統一 uid 格式~~ 工具已完成（2026-11-23）：新的 LINE 使用者直接用 `u_`，舊使用者用 `migrateLegacyUid` 轉移（重用合併的零件，帶備份與重試）。**尚待在正式環境執行**；執行後這個項目才算結案。
