# P18 首頁大改版：四大功能整合

日期：2026-11-14　狀態：backlog（自 todo.md 搬入，尚未 brainstorm；動工前先走設計流程產出正式 spec）


目標：首頁整合個人記帳、旅遊分帳、儲蓄目標、匯率計算四大功能，且不依賴 LINE 登入。**尚無獨立 spec，等 P14、P12、匯率頁完成後再 brainstorm。**架構決策已定（同一專案、`src/features/*` 功能模組分界、不拆微服務），見 `docs/superpowers/specs/2026-11-14-p14-identity-design.md` 開頭。

- [ ] 首頁改為四功能入口與摘要卡片（各功能模組提供摘要，首頁只負責整合）。
- [ ] 現有頁面依功能搬進 `src/features/*`，路由維持 lazy load。
- [ ] 登入畫面與首頁頭像選單整併（P14 的多種登入、P12 與儲蓄目標入口）。
- [ ] 更新 `README.md`、`docs/architecture.md`。
