# 收據帳本風格：全站套用計畫

首頁已試做完成並確認（`src/pages/HomePage.jsx`、`src/index.css` 的 `--cs-rc-*`）。本計畫把風格推到全站。

## 風格定義（已定案，照首頁）

- 概念：分帳像一張收據。墨藍 header 加底緣鋸齒撕邊（唯一主視覺），卡片是票根，金額用等寬字。
- 圓角一律 6px，邊框 `1px solid var(--cs-rc-rule)`，分隔線用 `1.5px dashed var(--cs-rc-rule)`。
- 橘色只當「印章」：主按鈕、選中、進度、連結，用 `var(--cs-rc-stamp)`，按鈕字用 `var(--cs-rc-stamp-text)`。
- 應付 `--cs-rc-owe`、應收 `--cs-rc-get`、金額字體 `--cs-rc-mono` 加 `tabular-nums`。
- 不用：全大寫標籤、漸層、編號、卡片陰影。
- 淺色與深色兩套值都在 `index.css`，深色已調亮，不要再變暗。

## 原則

- 每步獨立 commit（由使用者 commit，我不自動 commit），每步結束都要通過 `npm run check:colors`、`npx eslint src`、`npm run build`。
- 不改功能、不動資料與邏輯，只改視覺。
- 寬版規則（`.cs-header`、`.cs-body`、720／480 同步點）不動。
- 沒辦法開瀏覽器就如實說明，請使用者用 `npm run dev` 看淺色／深色兩種模式。

## 步驟 1：token 併入與共用 header

目標：全站基調一致，其他頁不再是橘色 header。

1. `index.css`：把舊的中性 token 改指向收據色票，讓沒改到的頁面也跟上。
   - `--cs-bg`→`--cs-rc-bg`、`--cs-card`→`--cs-rc-card`、`--cs-text`→`--cs-rc-ink`、`--cs-text-sub`→`--cs-rc-sub`、`--cs-border`→`--cs-rc-rule`（淺色與深色都要）。
   - `--cs-soft`、`--cs-soft-2`、`--cs-track`、`--cs-text-2`、`--cs-text-mute`、`--cs-line-soft` 是暖橘調，改成同色系的冷灰藍（淺色與深色各自選值，維持對比）。
   - `--cs-gi-*` 群組圖示配色不動。
2. 新增共用元件 `src/components/ReceiptHeader.jsx`：墨藍底、`cs-header` class、底緣鋸齒；吃 children，padding 可調（一般 `16px 16px 20px`，群組頁 `16px 16px 32px`）。
3. 15 個頁面的橘色漸層 header 換成該元件。檔案：AddExpensePage、CreateGroupPage、EditExpensePage、EditGroupPage、ExpenseDetailPage、GroupPage（258 行，另有 405 行的漸層要看是什麼）、MembersPage、PaymentMethodsPage、SavingsGoalFormPage、SavingsGoalPage、SavingsListPage、SettingsPage、SettlePage、StatsPage、TransferPage。
   - header 上的返回鍵、標題文字色改 `--cs-rc-head-text`；原本白色半透明的元素改成同色加 opacity。
   - 用 `--cs-on-brand*`（橘色頁首上的預算進度條）的地方要重新確認在墨藍底上的對比。
4. HomePage 的 header 也改用該元件，確保單一來源。
5. 驗證：check:colors、eslint、build；列出仍含 `linear-gradient(135deg, #FF8C42` 的檔案應為 0。

## 步驟 2：取代寫死的橘色

目標：`#FF8C42`／`#FF6B1A` 全部換成 token（約 130 處、25 個檔案）。逐處判斷用途：

| 用途 | 換成 |
|---|---|
| 主按鈕底色 | `var(--cs-rc-stamp)`，字用 `var(--cs-rc-stamp-text)` |
| 選中、強調文字、連結、圖示 | `var(--cs-rc-stamp)` |
| 應付金額 | `var(--cs-rc-owe)` |
| 進度條 | `var(--cs-rc-stamp)`，軌道用 `--cs-track` |
| 淡橘底（選中背景、提示） | 新增 `--cs-rc-stamp-soft`（淺色 `#fdeee3`、深色 `#3d3029`） |

順序（依數量）：ExpenseForm(19)、GroupPage(12)、DateTimeField(9)、ExpenseDetailPage(8)、MembersPage(7)、TransferPage(6)、SettlePage(6)，其餘依序。
注意：LINE 綠 `#06C755` 是品牌色，不動。`--cs-gi-orange-fg` 是群組圖示色，不動。

## 步驟 3：逐頁微調

1. GroupPage：消費明細列做成收據列（虛線分隔、金額等寬）、預算進度區對比。
2. SettlePage、TransferPage：轉帳清單做成帳單列，金額等寬。
3. StatsPage：圖表顏色與軸線換成冷色系加印章橘，確保深色可讀。
4. TabBar、各 Modal／底部抽屜、表單輸入框：圓角 6px、邊框統一。
5. 其餘頁（Settings、Members、Savings 系列、PaymentMethods）檢查卡片與按鈕圓角。
6. 登入、訪客加入（GuestJoin）、AuthCallbackPage 檢查。

## 收尾

- 更新 `docs/theme.md`：新增 `--cs-rc-*` 說明與風格原則；README 功能清單不需改。
- 刪除這份計畫檔（比照之前暗黑模式的做法）。
- 最後請使用者用淺色／深色、手機寬度與網頁寬度各看一次所有頁面。
