# P5 更多收款碼

日期：2026-11-14　狀態：backlog（自 todo.md 搬入，尚未 brainstorm；動工前先走設計流程產出正式 spec）


現況：`PROVIDERS` 只有 4 種（`richart`、`jkopay`、`bank`、`custom`，`src/config/paymentProviders.js`）；每人沒有數量上限、沒有排序、沒有 QR 圖片欄位。

- [ ] **去耦合**：確認 `TransferPage` 的選單由收款人實際擁有的方式產生、比對用 `providerId`（P1 已改存 `providerId`，動工前先看現況還剩什麼）。
- [ ] **新增 provider**：
  - [ ] QR 圖片（通用，涵蓋沒有穩定連結的錢包）。
  - [ ] PayPal.me 等連結型。
  - [ ] LINE Pay、台灣 Pay、悠遊付等：先確認連結格式（`docs/guides/payment-methods.md` 寫明連結格式未知前不支援），沒有穩定 deep link 的先歸入 QR 圖片或自訂。
  - [ ] 其他地區：`REGIONS` 加項目，選單 UI 已存在（目前只有一個地區所以隱藏）。
  - 每個 provider 要有 `parse`、`openUrl`、`validate`，並補 `paymentProviders.test.js`。
- [ ] **QR 圖片**：
  - 欄位 `qrPath`；Storage 路徑 `users/{uid}/paymentMethods/{methodId}/…`；`storage.rules` 用 `firestore.get` 判斷該筆 `isPublic`。
  - 上傳重用 `CropModal`（比例 1）與 `browser-image-compression`。
  - `PaymentMethodBody` 顯示圖片並提示長按儲存。
- [ ] **數量上限**（建議 10）：rules 無法計數，先做客戶端軟上限；要硬限制就改成 Cloud Function 新增。
- [ ] **排序與預設**：新增 `order` 欄位與調整順序的介面；可選「預設」標記。
- [ ] **rules**：補 `providerId`、`customName`、`label`、`bankCode` 的驗證（目前只驗 `value`、`isPublic`）。
- [ ] 更新 `docs/guides/payment-methods.md`。

**驗證**：兩個帳號互相檢視公開與不公開的 QR；`firestore.rules`、`storage.rules` 雙帳號實測。

**風險**：QR 圖片是公開給所有登入者看的敏感資料；訪客不能新增（現況）；Storage 沒有每人配額，要留意濫用。
