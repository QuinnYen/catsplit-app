# TODO

## 啟動速度優化

- [x] 先量化：跑 `vite build`，記錄各 chunk 大小作為基準
  - 基準（2026-10-05）：單一 JS `index-*.js` 949.48 kB（gzip 288.16 kB）、CSS 6.31 kB（gzip 2.05 kB）、logo 25.94 kB，全部打成一包，Vite 有 >500 kB 警告
- [x] 路由改用 `React.lazy` + `Suspense`（[src/App.jsx](src/App.jsx)）
  - 首頁、群組頁維持直接載入，其餘 9 頁改 lazy；首次載入約 792 kB（gzip ≈ 243 kB），原 949 kB（gzip 288 kB）
- [x] `browser-image-compression`、`react-easy-crop` 改成用到才動態 `import()`
  - 壓縮套件改在選圖/上傳時載入；CropModal 改 `lazy`，選了圖才下載。EditGroupPage 38 kB → 12 kB
- [x] 啟動流程：`getProfile` 與 `verifyLiffToken` 平行化（[src/context/AppContext.jsx](src/context/AppContext.jsx)）
- [x] 啟動流程：有快取時先渲染畫面，背景再驗證 → 改以下方「快速路徑」實現（仍等 `auth.authStateReady()`，避開 Firestore 規則在 auth 未恢復時拒絕查詢的風險）
- [x] ~~延後 Storage / App Check 初始化~~（已評估，不做）
  - Storage：GroupPage 經 `storageCleanup` 直接 import，首頁路徑本來就會載入；要延後得改約 8 處，SDK 本身只有十幾 kB gzip，收益小
  - App Check：須在第一個 Firestore/Storage 請求前初始化，延後會有被強制驗證拒絕的風險；reCAPTCHA 腳本本來就是非同步注入，省不到什麼
- [x] `vite.config.js` 拆 vendor chunk（react、firebase、liff）
  - Vite 8 用 rolldown，`manualChunks` 已棄用，改用 `output.codeSplitting.groups`
  - 結果：app 程式碼 71 kB、liff 120 kB、react 230 kB、firebase 367 kB；首次載入總量不變，但改版只需重下 app 那一包
- [x] 實機量測啟動各階段耗時（臨時診斷 [src/utils/bootTrace.jsx](src/utils/bootTrace.jsx)，在 LINE 開 `liff.line.me/<LIFF ID>?debug=1` 後面板常駐）
- [x] 依量測結果優化啟動鏈：已有同一使用者的 Firebase 登入時跳過 `verifyLiffToken` + `signInWithCustomToken` + 等待 `getProfile`（[AppContext.jsx](src/context/AppContext.jsx) 快速路徑）
  - 量測基準（LINE 實機）：總共 ~2.6 s；liff.init 762 ms、getProfile+verify 1015 ms、signIn 437 ms、群組資料 188 ms
- [x] 部署後實機再量一次：快速路徑命中時 523 ms 看到首頁資料（原 2582 ms）
- [x] 實機驗證其他情況（登出再登入、換帳號、訪客認領）：走完整流程，1228 ms 抵達首頁
- [x] 移除臨時診斷（bootTrace 及各處 `mark()` / `BootTrace`）
- [x] ~~`verifyLiffToken` 設 `minInstances: 1`~~（已評估，不做：常駐約 $2.88/月，而快速路徑下重複開啟不呼叫此函式；若實測發現完整流程常發生再回頭設）
- [ ] （可選）完整流程下 `getProfile` 其實可省（verify 回應已含名字與頭像）
- [x] 優化後再量一次，對照基準
  - 首次載入 JS（`index.html` 的 script + modulepreload 加總）：949.48 kB → 791.64 kB（-16.6%）；gzip 288.16 kB → 243.73 kB（-15.4%）
  - CSS、logo 沒變；Vite >500 kB 警告已消失
  - 未量：LINE 內實際啟動時間（需部署後實機測）
