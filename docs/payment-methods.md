# 收款方式

使用者可以在首頁頭像選單的「收款方式」設定自己的收款資訊。轉帳時，付款人選了付款方式，就會自動帶出收款人對應的收款方式，可以複製，或一鍵開啟已安裝的支付 App。

## 支援的收款方式

| 收款方式 | 使用者填什麼 | 開啟 App |
| --- | --- | --- |
| Richart | 貼上 Richart App 分享的收款連結（整段文字也可以，會自動抓出連結） | 開啟收款連結 |
| 街口支付 | 街口帳號（貼上整段分享文字也可以） | 開啟街口的轉帳連結 |
| 銀行轉帳 | 搜尋選銀行（代碼表見 `src/config/bankCodes.json`）＋帳號 | 無，只能複製 |
| 自行輸入 | 自訂名稱＋收款資訊 | 無，只能複製 |

- Richart 連結裡的 `token` 由 Richart App 產生，無法自行組出，所以一定要請使用者貼上自己的連結。token 失效時需要重新貼一次。
- LINE Pay、其他地區（大陸等）的支付 App 目前不支援，需要先取得各家的連結格式才能串接。
- 轉帳頁的付款方式下拉選單裡，名稱與收款方式名稱相同的項目（街口支付、Richart、銀行轉帳）會自動帶出對應收款方式；選「其他」時會帶出收款人所有「自行輸入」的。

## 資料結構

`users/{uid}/paymentMethods/{id}`

| 欄位 | 說明 |
| --- | --- |
| `providerId` | `richart`、`jkopay`、`bank`、`custom` |
| `value` | Richart 為 token、街口為帳號、銀行為帳號、自行輸入為收款資訊 |
| `bankCode` | 僅銀行轉帳，3 碼；銀行名稱由代碼表查出，不存進資料庫 |
| `customName` | 僅自行輸入，使用者自訂的收款方式名稱 |
| `label` | 備註（選填） |
| `isPublic` | 是否公開顯示 |
| `createdAt` | 建立時間 |

## 可見範圍

- 每一筆有一個「公開顯示」開關。關閉時只有本人看得到。
- 開啟時，任何已登入的使用者只要知道對方的 uid 就能讀取。uid 只出現在群組成員資料裡，所以實際上等同於同群組的人可以看到。
- **這不是強隔離**：LINE userId 並非機密，知道 uid 的人就能讀。收款資訊本來就是給人轉帳用的，風險在可接受範圍；若之後需要更嚴格，要改成「同群組才能讀」，做法是把收款資料複製進各群組的 `memberProfiles`，改動較大。
- 訪客沒有穩定身分，不能設定收款方式，但可以看到收款人公開的收款方式。虛擬成員（`p_` 開頭）沒有帳號，不會查詢。
- 「刪除我的資料」會一併刪除自己的收款方式。
- 規則在 `firestore.rules`，改動後需部署：`firebase deploy --only firestore:rules`。

## 新增一種收款方式

在 `src/config/paymentProviders.js` 的 `PROVIDERS` 加一筆：

- `kind: 'app'`：填一組識別資料。需要 `parse(raw)`（把使用者輸入轉成要儲存的值，格式不對回傳空字串）和 `openUrl(value)`（組出開啟 App 的連結）。可選 `display`（畫面顯示文字）、`hint`、`placeholder`。
- 想讓轉帳頁自動帶出，`name` 要同時加進 `src/pages/TransferPage.jsx` 的 `PAYMENT_METHODS`，名稱必須一致。
- 補上 `src/config/paymentProviders.test.js` 的解析測試。

開啟 App 用的是 https 連結（universal link）。在 LINE 內用 `liff.openWindow({ external: true })` 開啟，一般瀏覽器則直接導向。各家的連結格式官方沒有公開，確認格式的做法：用相機掃對方的收款 QR Code 看內容、查該網站的 `/.well-known/apple-app-site-association` 看註冊了哪些路徑。
