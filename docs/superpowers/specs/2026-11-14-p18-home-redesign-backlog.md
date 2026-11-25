# P18 首頁大改版：四大功能整合

日期：2026-11-14　狀態：backlog（自 todo.md 搬入，尚未 brainstorm；動工前先走設計流程產出正式 spec）


目標：首頁整合個人記帳、旅遊分帳、儲蓄目標、匯率計算四大功能，且不依賴 LINE 登入。**尚無獨立 spec，P14、P12 已完成，等匯率頁完成後再 brainstorm。**架構決策已定（同一專案、`src/features/*` 功能模組分界、不拆微服務），見 `docs/superpowers/archive/2026-11-14-p14-identity-design.md` 開頭。

**第一階段（2026-11-24 完成）**：全站底部主導覽列 `MainTabBar`（記帳／分帳／目標／匯率，首頁即分帳）、`/fx` 佔位頁（`ComingSoonPage`；`/ledger` 已由 P12 取代）、儲蓄入口移出頭像選單、移除 HomePage 內未使用的未登入區塊。訪客可見全部 Tab，記帳與目標灰色並提示。群組內頁仍用原 `TabBar`。

- [ ] 首頁改為四功能入口與摘要卡片（各功能模組提供摘要，首頁只負責整合）。
- [ ] 現有頁面依功能搬進 `src/features/*`，路由維持 lazy load。
- [ ] 登入畫面與首頁頭像選單整併（P14 的多種登入、P12 與儲蓄目標入口）。
- [ ] 更新 `README.md`、`docs/guides/architecture.md`。
