# 文件索引

分三類：**guides** 描述現在的程式（改功能時要同步更新）、**research** 是一次性研究（有日期，不會隨程式更新）、**superpowers** 是規劃（進行中與 backlog 在 `specs/`，已完成的在 `archive/`）。

## guides — 現行功能與維運

| 文件 | 內容 |
|---|---|
| [專案結構](guides/architecture.md) | 目錄說明、技術棧、PWA、網頁版版型 |
| [資料模型](guides/data-model.md) | Firestore 集合、欄位、索引、查詢與成本 |
| [身分與訪客](guides/identity-and-guests.md) | LINE／Google 登入、帳號綁定與合併、訪客與認領 |
| [安全與維運](guides/operations.md) | rules、CORS、換網域、備份、已知取捨與待辦 |
| [多國語言](guides/i18n.md) | 字典與 `t()`、語言判定、分類與付款方式代碼 |
| [暗黑模式](guides/theme.md) | 主題切換、`--cs-*` 顏色變數與 `check:colors` |
| [貨幣與匯率](guides/currency.md) | 貨幣清單、基準幣、母國貨幣、結算取整 |
| [收款方式](guides/payment-methods.md) | 支援的收款方式、資料結構、可見範圍 |
| [儲蓄目標](guides/savings-goals.md) | 頁面、資料結構、金額規則與刪除流程 |
| [個人記帳](guides/personal-ledger.md) | 多帳本、帳戶、多幣別帳目、記帳面板、刪除 |
| [啟動速度](guides/startup-performance.md) | 登入快速路徑與載入策略 |

## research — 研究報告

| 文件 | 內容 |
|---|---|
| [LINE 平台 API 研究（2026-11）](research/line-platform-research-2026-11.md) | LIFF、LINE Login、Messaging API、LINE MINI App、費用；P17 群組 Bot 的依據 |

## superpowers — 規劃

- [Specs 與 Backlog 索引](superpowers/specs/README.md)：功能路線、進行中與待辦項目（P12、匯率頁、P18、P5、P7、P8、P9、P17）。
- [plans](superpowers/plans/)：進行中的實作計畫（目前是 [P12 個人記帳](superpowers/plans/2026-11-24-p12-ledger-plan.md)）。
- [archive](superpowers/archive/)：已完成並上線的設計與計畫。
  - P14 獨立帳號：[設計](superpowers/archive/2026-11-14-p14-identity-design.md)、[實作計畫](superpowers/archive/2026-11-23-p14-identity-plan.md)

## 整理規則

- 新功能上線後，要長期維護的說明放進 `guides/`；該功能的 spec 與計畫完成後搬進 `superpowers/archive/`，並在 `specs/README.md` 的表格改連結。
- 引用文件路徑時用 `docs/<分類>/<檔名>`，搬檔後用 grep 檢查舊路徑。
- 只改文件的 push 不會觸發部署（workflow 設定了 `paths-ignore`）。
