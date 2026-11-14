# P8 分類預算

日期：2026-11-14　狀態：backlog（自 todo.md 搬入，尚未 brainstorm；動工前先走設計流程產出正式 spec）


由原本「後續與已知小問題」的預算項目移出。現況：預算只有整個群組一個 `budget = { amount, period: { type: 'trip' } }`，`validBudget()` 的註解已預留 `byCategory`。

- [ ] `budget.byCategory`：分類代碼對上限金額；需要依分類的淨額（支出 − 收入）。
- [ ] rules：`validBudget()` 的 `hasOnly` 放寬，驗證 `byCategory` 為 map、值為合理數字；補 `firestore-tests`。
- [ ] 自訂分類只能比對文字；與內建分類代碼的對應見 `docs/i18n.md`。
- [ ] 群組設定頁、群組頁進度條、記帳頁提示、首頁徽章要決定顯示哪一層（整體或各分類）。
- [ ] 更新 `docs/operations.md` 的預算說明。
