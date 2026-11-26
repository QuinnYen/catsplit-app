# 匯率頁與其他小功能

日期：2026-11-14　狀態：backlog（自 todo.md 搬入，尚未 brainstorm；動工前先走設計流程產出正式 spec）。匯率換算頁已完成，只剩下面的預算、網頁版與已知小問題。


**匯率換算頁**：已完成（2026-11-26），見 [設計](../archive/2026-11-26-fx-page-design.md)。

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
