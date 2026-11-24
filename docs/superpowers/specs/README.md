# Specs 與 Backlog 索引

取代原 `todo.md`（2026-11-14 移除）。已完成並上線的設計與計畫（目前是 P14）搬到 [`../archive/`](../archive/)。文件總索引見 [`docs/README.md`](../../README.md)。`[ ]` 未開始　`[~]` 進行中。已完成的功能（P0 共用基礎、P1 多國語言、P2 網頁版置中、P3 收入、P4 預算第一版、P10 統計趨勢範圍、P11 CSV 匯出美化、P13 群組頁改版）見 `README.md` 與 `docs/`。

**每項完成時都要做**：`npm run lint`、`npm test`、`npm run build`；更新 `README.md` 功能清單與相關 `docs/`；涉及 rules 或 functions 的，**rules 與前端放在同一個 PR**（CI 推 `main` 就部署，新欄位沒有 rules 會在正式環境被拒絕）；rules 改動要有測試（`npm run test:rules`）並用兩個帳號實測（見 `docs/guides/operations.md`）。

## 平台化路線

個人記帳、旅遊分帳、儲蓄目標、匯率計算整合，不依賴 LINE。依序：P14 → P12 → 匯率頁 → P18。架構決策（同一專案、`src/features/*` 功能模組分界、不拆微服務）見 P14 spec 開頭。

| # | 項目 | 檔案 | 狀態 |
|---|---|---|---|
| P14 | 獨立帳號：多種登入方式與帳號綁定 | [設計](../archive/2026-11-14-p14-identity-design.md)、[計畫](../archive/2026-11-23-p14-identity-plan.md) | 已完成並上線（2026-11-23） |
| P12 | 個人記帳（含群組連結自動同步） | `2026-11-14-p12-personal-ledger-design.md`、計畫 [`../plans/2026-11-24-p12-ledger-plan.md`](../plans/2026-11-24-p12-ledger-plan.md) | 決定已確認、計畫已擬（2026-11-24），尚未動工 |
| — | 匯率頁（等使用者提供參考 App 截圖）與其他小功能 | `2026-11-14-fx-page-and-misc-backlog.md` | backlog |
| P18 | 首頁大改版：四大功能整合 | `2026-11-14-p18-home-redesign-backlog.md` | 第一階段已完成（2026-11-24）：主導覽列與佔位頁；摘要卡片、`src/features/*` 搬移待 P12 與匯率頁 |

## 其他 Backlog

| # | 項目 | 檔案 | 狀態 |
|---|---|---|---|
| P5 | 更多收款碼 | `2026-11-14-p5-payment-qr-backlog.md` | [ ] |
| P7 | 逐項分帳 | `2026-11-14-p7-itemized-split-backlog.md` | [ ] |
| P8 | 分類預算 | `2026-11-14-p8-category-budget-backlog.md` | [ ] |
| P9 | 重複性支出 | `2026-11-14-p9-recurring-expense-backlog.md` | [ ] |
| P17 | 群組 Bot 與 LINE 群組綁定 | `2026-11-14-p17-line-group-bot-backlog.md` | [ ] |
