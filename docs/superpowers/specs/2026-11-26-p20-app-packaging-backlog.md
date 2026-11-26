# P20 App 化：上架 Google Play（TWA）

日期：2026-11-26　狀態：backlog（尚未動工；多數步驟要在使用者自己的電腦與 Google Play Console 操作）

目標：把現有 PWA 包成 Android App 上架 Google Play。**不重寫程式**：用 TWA（Trusted Web Activity）以 Chrome 引擎全螢幕顯示線上網頁，沒有網址列；更新內容不用重新上架，推到 `main` 部署後使用者下次開啟就是新版（`UpdateBanner` 負責提示長時間開著的情況）。

## 做法

- 用 **PWABuilder** 或 **Bubblewrap**，輸入 `https://catsplit-app.web.app`，讀 `manifest.webmanifest` 產出 Android 專案與 `.aab`。
- 網站放 `/.well-known/assetlinks.json`，證明網站授權這個 App，App 才不會顯示網址列。放在 `public/.well-known/`，要確認能被直接存取且 `Content-Type` 是 JSON（Firebase 會先服務實體檔案，不會被 `**` 改寫到 `index.html`）。
- 簽章用 Google 的 Play App Signing，assetlinks 裡填 Google 給的那組指紋（上傳金鑰與發佈金鑰不同，兩組可能都要填，上架時看 Play Console 的說明）。

## 需要使用者準備

- Google Play 開發者帳號（一次性註冊費約 US$25）。
- 隱私權政策網址（已有 `/privacy.html`）、商店圖示 512×512（已有 `icon-512.png`）、功能圖片 1024×500、截圖、簡短與完整說明。
- 內容分級問卷、資料安全性表單（要誠實申報：LINE／Google 帳號名稱與頭像、帳目資料）。
- 審核用測試帳號或說明（審核人員需要能登入；可說明用訪客試用，但訪客不能用記帳）。
- **個人開發者帳號的封閉測試要求**：Google 近年對新的個人帳號要求先封閉測試一段時間、有一定數量的測試人員才能申請正式上架。我記得是 12 位測試者、14 天，但政策改過，**註冊時以官方說明為準，這裡的數字未經查證**。

## 這個專案要注意的地方

- **登入流程**：LINE 與 Google 登入會導去外部網址（LINE 授權頁、Google 帳戶頁）再導回 `/auth/callback`。TWA 內外部頁面用 Chrome 自訂分頁開啟，導回自己的網域通常會回到 App，**必須實機測**。
- **LIFF**：在 Android App 內走的是現有的外部瀏覽器 OAuth 流程，不使用 LIFF 內建功能。
- **審核風險**：Google 對純網站套殼通常能過，但會看有沒有基本價值與能正常運作。
- **manifest 補強**（可先做）：檢查 `id`、`display`、`start_url`、`scope`、`theme_color`、`screenshots`、`shortcuts`、maskable 圖示等欄位。
- iOS：Apple 不接受純 PWA 上架，要包成原生外殼（例如 Capacitor），審核更嚴（純網站套殼容易被以最低功能要求退件），工作量與風險明顯較高，不在這項範圍。

## 分階段

1. **前置（我可以先做）**：manifest 審視與補強、預留 `.well-known/assetlinks.json`（檔案內容待使用者提供指紋）與標頭確認（`firebase.json` 與 `hostingHeaders.test.js`）、整理上架清單（含商店文案草稿）。
2. **使用者操作**：註冊 Play 開發者帳號、用 PWABuilder／Bubblewrap 產 `.aab`（可由我寫成 PowerShell 逐步指令）、在 Play Console 建立應用程式、上傳、填問卷。
3. **封閉測試與正式上架**：登入流程實機驗證、補齊審核需要的測試說明。

## 與其他項目的關係

- [P19 離線使用](2026-11-26-p19-offline-backlog.md)：非必要前置，但離線外殼會讓 App 體驗更完整；Service Worker 與版本更新的設計會互相影響，先做哪個都要記得兩邊一起看。
