# TODO

## 啟動速度優化

- [x] 先量化：跑 `vite build`，記錄各 chunk 大小作為基準
  - 基準（2026-10-05）：單一 JS `index-*.js` 949.48 kB（gzip 288.16 kB）、CSS 6.31 kB（gzip 2.05 kB）、logo 25.94 kB，全部打成一包，Vite 有 >500 kB 警告
- [x] 路由改用 `React.lazy` + `Suspense`（[src/App.jsx](src/App.jsx)）
  - 首頁、群組頁維持直接載入，其餘 9 頁改 lazy；首次載入約 792 kB（gzip ≈ 243 kB），原 949 kB（gzip 288 kB）
- [x] `browser-image-compression`、`react-easy-crop` 改成用到才動態 `import()`
  - 壓縮套件改在選圖/上傳時載入；CropModal 改 `lazy`，選了圖才下載。EditGroupPage 38 kB → 12 kB
- [x] 啟動流程：`getProfile` 與 `verifyLiffToken` 平行化（[src/context/AppContext.jsx](src/context/AppContext.jsx)）
- [ ] 啟動流程：有 `catsplit_user` 快取時先渲染畫面，背景再驗證（注意 Firestore 規則在 auth 未恢復時的查詢）
- [ ] 延後 Storage / App Check 初始化（[src/config/firebase.js](src/config/firebase.js)）
- [ ] `vite.config.js` 加 `manualChunks` 拆 vendor chunk（react、firebase）
- [ ] 優化後再量一次，對照基準
