# P17 群組 Bot 與 LINE 群組綁定

日期：2026-11-14　狀態：backlog（自 todo.md 搬入，尚未 brainstorm；動工前先走設計流程產出正式 spec）


來源：`docs/line-platform-research-2026-11.md` §4 P17。在 LINE 群組內查結算、餘額、記帳，回覆一律用 **reply（不計費）**。

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
