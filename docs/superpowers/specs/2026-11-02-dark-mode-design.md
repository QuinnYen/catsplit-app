# 暗黑模式（Dark Mode）設計

日期：2026-11-02

## 目的

使用者可以在「跟隨系統／淺色／深色」之間切換，夜間使用不刺眼。範圍是整個 App 的所有頁面與彈窗。

## 範圍與假設

- 三種模式：`system`（預設，跟隨手機／瀏覽器的 `prefers-color-scheme`）、`light`、`dark`。
- 設定只存在裝置本機（`localStorage`，key `cs-theme`），不同步到帳號、不動 Firestore。
- 訪客與 LINE 使用者都能切換（設定頁本來就開放給訪客）。
- 橘色品牌色（`#FF8C42`、`#FF6B1A`）、橘色頁首漸層與其上的白字、LINE 綠色按鈕（`#06C755`）兩種模式下不變。
- 不在範圍內：`public/` 下的靜態頁（`terms*.html`、`privacy*.html`）、LINE Flex 分享訊息、分享預覽頁，維持淺色。

## 機制

- `src/index.css`：`:root` 定義淺色的 CSS 變數，`:root[data-theme="dark"]` 覆寫成深色值並設 `color-scheme: dark`（讓原生日期選擇器、輸入框、捲軸跟著變深）。`:root` 同樣設 `color-scheme: light`。
- `src/theme/ThemeProvider.jsx`（新）：提供 `useTheme(): { mode, resolved, setMode }`。`mode` 為 `'system' | 'light' | 'dark'`，`resolved` 為實際套用的 `'light' | 'dark'`。`mode === 'system'` 時用 `matchMedia('(prefers-color-scheme: dark)')` 判斷並監聽變化。每次變動把 `resolved` 寫到 `document.documentElement.dataset.theme`，`mode` 寫到 `localStorage`。
- `index.html`：`<head>` 加一小段內嵌腳本，在 App 載入前依 `localStorage` 與系統設定先設好 `data-theme`，避免載入時閃白。
- `src/main.jsx`：以 `ThemeProvider` 包住 App。
- `src/pages/SettingsPage.jsx`：語言選單旁新增「外觀」選單（三個選項）。i18n 新增 `settings.theme`、`settings.theme.system`、`settings.theme.light`、`settings.theme.dark`（zh-TW 與 en）。

純函式 `resolveTheme(mode, systemPrefersDark): 'light' | 'dark'` 與 `normalizeMode(value): 'system' | 'light' | 'dark'`（非法或空值回傳 `'system'`）放在 `src/theme/theme.js`，用 `node --test` 先寫測試。

## 色碼替換

把 `src` 裡寫死的色碼改成語意變數。依屬性判斷，不能只看色碼，因為 `#fff` 同時是卡片底色與橘色按鈕上的白字：

- `background`、`backgroundColor`、`border*Color` 的 `#fff` → 卡片變數；`color` 的 `#fff` 保持不變。
- `rgba(255,255,255,…)` 用在橘色頁首與按鈕上的半透明白，保持不變。

### 變數與配色

| 變數 | 用途 | 淺色 | 深色 |
|---|---|---|---|
| `--cs-bg` | 頁面底 | `#fff8f4` | `#1f1713` |
| `--cs-card` | 卡片、彈窗底 | `#fff` | `#2a201a` |
| `--cs-soft` | 淡橘底 | `#fff3ec` | `#3a2a20` |
| `--cs-border` | 邊框、分隔線 | `#f0d5c0` | `#4a382c` |
| `--cs-text` | 主要文字 | `#3d2b1f` | `#f3e6dc` |
| `--cs-text-sub` | 次要文字 | `#b08060` | `#c9a487` |
| `--cs-text-mute` | 更淡的文字、占位 | `#c4a882` | `#a58b70` |
| `--cs-line-soft` | 更淡的邊線 | `#e0c4b0` | `#5a4638` |
| `--cs-overlay` | 彈窗遮罩 | `rgba(61,43,31,0.4)` | `rgba(0,0,0,0.6)` |

狀態色（紅 `#e53935`／`#e57373`、綠 `#4caf50`／`#2e7d32`、藍 `#1976d2` 與其淺色底 `#ffebee`／`#ffcdd2` 等）：淺色底改為同色系的深色底，飽和的文字色在深色下改用較亮的色調，各自拆成變數。這些零星色碼的深色值在實作計畫中逐一定案，原則是文字對比至少 4.5:1。

群組圖示配色（`src/config/groupIcons.js` 的 `{ bg, fg }` 成對色碼）也改成變數，淺色底在深色下改為深色調。資料庫存的是顏色名稱而非色碼，不需要遷移。

## 驗證

- `scripts/check-colors.mjs`（新）與 `npm run check:colors`，仿 `check:cjk`：掃出 `src` 裡仍寫死、應該改成變數的色碼，列出檔案與行號，有命中則退出碼為 1。允許清單：橘色品牌色、LINE 綠、`color` 屬性的 `#fff`、橘色頁首上的 `rgba(255,255,255,…)`。
- `npm test` 納入 `theme.js` 的測試與 `check:colors` 的測試。
- 視覺：在 emulator 裡逐頁切換三種模式檢查（首頁、群組、新增與編輯支出、結算、轉帳、統計、設定、收款方式、儲蓄目標、各彈窗與登入畫面），確認沒有白底殘留或看不見的字。

## 不做

- 帳號同步、依時間自動切換、自訂主題色。
- 靜態條款頁與 LINE 訊息的深色版。
