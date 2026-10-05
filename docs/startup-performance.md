# 啟動速度

從 LINE 開啟時，畫面要等登入完成才會出現，所以啟動流程是效能重點（實機約 2.6 秒 → 重複開啟約 0.5 秒、完整流程約 1.2 秒）：

- **快速路徑**（`AppContext.jsx`）：`liff.init` 之後，若 Firebase 已恢復登入，且它的 uid、快取使用者 uid、`liff.getDecodedIDToken().sub` 三者相同，且沒有待認領的訪客名字，就直接沿用快取使用者，**不呼叫 `verifyLiffToken`、不重新 `signInWithCustomToken`**，名字與頭像改在背景更新。任何條件不符就走完整流程。
- **不要拿掉 `auth.authStateReady()`**：Firestore 查詢必須等 Firebase Auth 恢復，否則 `request.auth` 是 null，`onSnapshot` 會被 rules 拒絕且不會重試。
- **有待認領的訪客名字時一定要走完整流程**，認領是在 `signInWithLineToken` 裡做的。
- 完整流程中 `getProfile` 與 `verifyLiffToken` 是平行發出的，因為 `liff.getIDToken()` 是同步的。
- 首頁與群組頁（邀請連結落地頁）直接載入，其餘頁面用 `React.lazy`；圖片壓縮與裁切套件用到才載入。`vite.config.js` 把 react、firebase、liff 拆成獨立檔案，改版後使用者只需重下 app 本體。
- 評估後**沒有**設 `minInstances`：`verifyLiffToken` 常駐約每月 $2.88，而快速路徑下重複開啟不會呼叫它。若之後發現完整流程常發生，再回頭設。
