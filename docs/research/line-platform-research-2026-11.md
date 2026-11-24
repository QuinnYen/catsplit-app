# CatSplit × LINE 平台 API 完整研究報告（查證日期：2026-11-03）

> **2026-11-24 註記**：本報告是查證當日的快照。下面「最緊急」的 LIFF 升級已完成（`package.json` 為 `@line/liff ^2.31.2`）；Messaging API、webhook 與費用的內容仍是 P17 群組 Bot 的依據，價格與政策動工前請再查證。

CatSplit 現在最緊急的事不是加新功能，而是**把 `@line/liff` 從 ^2.28.0 升級到 v2.31.2**。LIFF v2.20.0～v2.31.0 有 DOM-based XSS 漏洞（CVE-2026-112148，GitHub 安全公告 GHSA-wppr-qmp4-w627；第三方 CVE 資料庫給的 CVSS 4.0 分數為 5.1 Medium，NVD 尚未完成分析）。LINE Developers News 原文是 "we plan to restrict the use of older versions of the LIFF SDK (v2.20.0 through v2.31.0) around November 24, 2026"，而 CatSplit 正好支援非 LINE 訪客在外部瀏覽器開啟。升級之後，下一步是建立 Messaging API webhook（`lineWebhook`）。這條路要先把 Bot 拉進 LINE 群組，用**免費的 reply 訊息**做記帳與查詢；推播（push）只用在使用者自己訂閱的提醒，並嚴格控管則數。依 LINE Biz-Solutions 官方公告，台灣 2026-11-01 起中用量從 NT$800 調為 NT$1,000，高用量從 NT$1,200 調為 NT$1,400，免費則數不變。

## TL;DR
- **立即處理**：升級 `@line/liff` 到 2.31.2，並移除已棄用的 `liff.getLanguage()`。LIFF v2.20.0～v2.31.0 已因 XSS 漏洞（CVE-2026-112148）棄用。依 GHSA-wppr-qmp4-w627，攻擊者可能讀取應用網域內的驗證 token、localStorage 或非 HttpOnly 的 cookie。約 2026-11-24 起，舊版在外部瀏覽器可能無法登入或運作。v2.31.2 另外改變了 LIFF URL 查詢參數中 `?` 的處理方式，升級後要回歸測試 `liff.state` 轉址。
- **最高價值的新能力**是 Messaging API webhook 加群組 Bot：用 reply 回覆（不計費）做「群組內記帳、查結算」，用 Rich Menu 深層連結到 LIFF 各頁。LINE 官方建議用 Messaging API 取代 LINE Notify（已於 2025-03-31 終止）。push 依「收件人數」計費，推到 6 人群組就算 6 則。
- **做不到或不建議做**：LINE 官方沒有公開的「個人間轉帳」API。LINE Pay Online API v3/v4 只開放給簽約商家，不能用來記錄或發起朋友間的轉帳。MINI App 的服務通知只限「已驗證 MINI App」，MINI App 的應用程式內購買目前只在日本開放。LIFF 應用也不能遷移成 MINI App channel（只能另建）。所以 MINI App 遷移與 LINE 端內購目前都不建議作為優先項目。

---

## 1. 執行摘要

### 1.1 整體判斷
- CatSplit 的 LIFF 整合已經很完整（sendMessages、shareTargetPicker、getFriendship、requestFriendship 都有用）。最大的空白是**伺服器端與 LINE 的雙向通道**（webhook）。沒有 webhook，就做不到群組 Bot、圖文選單動態切換、取消好友的資料處理，也做不到任何通知。
- LINE userId 是 **Provider 層級**的值：同一位使用者在同一個 Provider 下的各個 channel 拿到相同 userId，不同 Provider 則不同。所以官方帳號（@uhu2720z）的\[1\]\[2\] Messaging API channel **必須和現有 LINE Login / LIFF channel 放在同一個 Provider**，否則 webhook 收到的 userId 無法直接對應 Firebase 使用者。這是第一個要人工確認的設定。
- 成本結構很適合分帳 App：**reply 不計費**；使用者透過\[3\]\[4\] LIFF `sendMessages` / `shareTargetPicker` 送出的訊息算「使用者發的訊息」，不經 Messaging API 發送，所以不屬於官方帳號的計費訊息（這是依計費規則推論，官方文件未逐字說明）。真正花錢的只有 push、multicast、broadcast、narrowcast。

### 1.2 最值得先做的前 5 項
| 順序 | 項目 | 理由 |
|---|---|---|
| 1 | **P15：LIFF SDK 安全升級（2.31.2）與相容性修正** | 有明確期限（約 2026-11-24）的安全風險；外部瀏覽器訪客流程直接受影響；工作量小 |
| 2 | **P16：Messaging API webhook 基礎建設**（`lineWebhook`、簽章驗證、冪等、follow/unfollow 狀態同步） | 後續所有 Bot、Rich Menu、通知功能的前提；只用 reply 時零訊息成本 |
| 3 | **P17：群組 Bot 與 LINE 群組綁定**（join → 綁定碼 → LIFF 綁定 → 群組內查結算或餘額） | 分帳的情境本來就在 LINE 群組；回覆免費；是差異化功能 |
| 4 | **P18：Rich Menu（預設＋依綁定狀態 per-user 切換＋LIFF 深層連結）** | 提高回訪；建立與綁定不產生訊息費；2026-07 起可用 API 取得 Rich Menu 成效數據\[5\] |
| 5 | **P19：可訂閱的提醒通知（結算或未還款，Cloud Scheduler 排程）＋配額守門** | 留存效果最強，但會產生 push 費用，所以要做 opt-in、彙整摘要和每月額度守門 |

---

## 2. LINE 平台能力總覽表

| API / 產品 | 需要新 Channel？ | 費用 | 台灣可用 | 2026-11 狀態 |
|---|---|---|---|---|
| LIFF v2（SDK 2.31.2） | 否（已有 LINE Login channel） | 免費 | ✅ | 穩定；**v2.20.0～2.31.0 已棄用**（XSS） |
| LINE Login v2.1（OIDC、PKCE） | 否 | 免費 | ✅ | 穩定 |
| Messaging API（webhook、reply、push…） | **要啟用 OA 的 Messaging API channel**（同一 Provider） | reply 免費；push 類依方案則數 | ✅ | 穩定；2026 有新事件與新 API |
| Rich Menu API | 同上 | 免費（不計訊息） | ✅ | 穩定；2026-07 新增 Insight API |
| Insight / Audience / Narrowcast | 同上 | 統計免費；narrowcast 計則數 | ✅ | 穩定 |
| Account Link | 同上 | 免費 | ✅ | 穩定（CatSplit 多半用不到，見 §3.4） |
| LINE 通知訊息（PNP，以電話號碼發送） | 同上＋**法人申請** | 另計（洽業務） | ✅（日、泰、台） | 法人選項；不適合個人開發者 |
| LINE Notify | — | — | ❌ | **已於 2025-03-31 終止** |
| LINE MINI App | **要另建 MINI App channel** | 免費；未驗證版功能受限 | ✅（2026-03-11 起開放建立） | 持續演進；服務通知只限已驗證 |
| LINE Pay Online API v3 / v4 | LINE Pay 商家帳號（非 Developers channel） | 依商家合約 | ✅（日本已於 2025-04-30 終止） | v4 於 2025-11 新增（台灣電支機構相關） |
| 聊天進階方案（含 AI 聊天機器人 β） | 否（OA Manager） | NT$100／月（未稅） | ✅ | 2025-03 上線 |
| LINE Things / Bluetooth plugin | — | — | — | **已停止提供文件與功能** |
| LINE Beacon | 同 Messaging API | 硬體另購 | ✅ | 存在，與分帳無關 |

---

## 3. 各 API 詳細章節

### 3.1 LIFF v2
**官方文件**：developers.line.biz/en/reference/liff/、/en/docs/liff/release-notes/
**Channel 與權限**：LINE Login channel 底下的 LIFF app；scope 有 `openid`、`email`、`profile`、`chat_message.write`。\[6\]
**費用**：免費。

**版本與棄用（最重要）**
- 目前最新版是 **v2.31.2（2026-10-07）**。v2.31.1（2026-09-30）修補了 DOM-based XSS 漏洞（CVE-2026-112148／GHSA-wppr-qmp4-w627；依該公告，受影響時應用網域內 JavaScript 可存取的驗證 token、localStorage 等可能被讀取）；**v2.20.0～v2.31.0 全部棄用**，LINE 計畫在 **2026-11-24 前後**限制使用，而且「日期可能提前、不另行通知」。\[7\]
- 觸發條件是在**外部瀏覽器**用特製查詢參數的 URL 開啟 LIFF。官方後來在 2026-10-20 的漏洞公告中補充（News 列表標示 "We have added a note about usage from LINE's in-app browser"）：如果在 LINE 內建瀏覽器直接開 endpoint URL（不經 LIFF URL），也會被當成外部瀏覽器處理，同樣受影響。限制開始後，舊版在外部瀏覽器可能無法使用 LINE Login 等功能。
- v2.31.2 的變更：在 LIFF 瀏覽器裡，LIFF URL 查詢參數值中的 `?` 不再被替換成 `&`。如果 CatSplit 的 `liff.state` 或 `return_url` 參數值裡含有 URL，必須回歸測試。\[8\]
- `liff.getLanguage()` 已棄用（自 v2.24.0），請改用 `liff.getAppLanguage()`。後者需要在 LIFF 瀏覽器、LINE 14.11.0 以上才回傳 LINE App 的語言，否則行為等同 getLanguage。\[6\]
- 2025-12-09 起，官方不再公開 LIFF 與 LINE Login 的 roadmap。\[9\]\[10\]

**主要 API 重點（改寫摘要）**
| API | 重點與限制 |
|---|---|
| `liff.init({liffId, withLoginOnExternalBrowser})` | 每個頁面都要呼叫；只保證在 endpoint URL 本身或其下層路徑有效；要等 init resolve 之後才能改 URL（pushState、replaceState、301/302 都算），否則可能打不開；primary redirect URL 裡帶有 access token，不要送進 GA 等記錄工具\[6\] |
| `liff.login()/logout()` | 在 LIFF 瀏覽器內**不能**呼叫 login（init 會自動登入）；外部瀏覽器要用 `liff.login()`，不要自己組 LINE Login 授權 URL\[6\] |
| `getAccessToken()` | 有效 12 小時，但使用者關閉 LIFF 時可能被撤銷\[6\] |
| `getIDToken()/getDecodedIDToken()` | 需要 `openid` scope；ID token 有效 1 小時；官方建議**不要把 decoded 資料送到伺服器**，應該送原始\[6\] ID token 讓後端驗證 |
| `getContext()` | `type`：`utou`／`group`／`room`／`external`／`none`。`viewType`：compact／tall／full。**groupId、roomId、utouId 已於 2023-02-06 停止提供**，所以無法從\[6\] LIFF 得知所在群組 ID |
| `getOS/getVersion/getLineVersion/isInClient/isLoggedIn/isApiAvailable` | `isApiAvailable` 可查 `shareTargetPicker`、`scanCodeV2`、`createShortcutOnHomeScreen`、`multipleLiffTransition`、`iap`、`skipChannelVerificationScreen`\[6\] |
| `sendMessages()` | 只能送到「開啟 LIFF 的那個聊天室」，**一次最多 5 個 message 物件**；需要\[11\] `chat_message.write`；用它送 Flex 或 template 時**不會觸發 webhook** |
| `shareTargetPicker(messages, {isMultiple})` | 最多 5 個 message；`isMultiple:false` 只顯示好友、只能選 1 位，但官方提醒這**不保證**只送給一人（使用者可以重複分享）。要在 Console 啟用。閒置超過\[6\]\[11\] 10 分鐘會出現 `EXCEPTION_IN_SUBWINDOW`\[6\] |
| `scanCodeV2()` | 要在 Console 打開 Scan QR；舊的 `scanCode()` 不能在外部瀏覽器使用。建議一律先用\[6\] `isApiAvailable('scanCodeV2')` 判斷 |
| `openWindow({url, external})` / `closeWindow()` | `closeWindow` 可以在 init 之前呼叫（v2.4.0 以上）\[12\] |
| `permission.query/getGrantedAll/requestAll` | `requestAll` **只能用在 LINE MINI App**，而且要開啟 Channel consent simplification\[6\] |
| `getFriendship()` / `requestFriendship()` | requestFriendship 是 v2.28.0（2026-03-24）新增，**只能在 Full 尺寸使用**；v2.30.0\[13\] 新增 `template` 屬性（15 種好處模板），並支援\[14\]\[15\] MINI App 的多官方帳號參數 |
| `permanentLink.createUrl()`、`createShortcutOnHomeScreen()` | 用來產生分享或深層連結、建立桌面捷徑；舊的 `addToHomeScreen` 已不提供\[6\] |
| `liff.use()` / Pluggable SDK | 可以按需載入模組來減少 bundle 大小\[12\] |
| Module mode | 在 Console 開啟後會隱藏 LIFF 標頭的動作按鈕\[16\] |
| LINE Things／Bluetooth plugin | `bluetoothLeFunction` 已標示「目前不提供」\[6\] |

**其他限制**：LIFF **不相容 OpenChat**（大多數情況下拿不到 profile）。\[6\]\[17\]LINE 15.20.0 起，LIFF 與 MINI App 的「最小化」行為改變了。\[9\]

### 3.2 LINE Login v2.1
**官方文件**：/en/docs/line-login/integrate-line-login/、/integrate-pkce/、/link-a-bot/
- 支援 OIDC，用 ID token 取得使用者資料。PKCE 只支援 `S256`。\[18\]\[19\]
- `bot_prompt=normal` 會在同意畫面顯示加好友選項；`aggressive` 會在同意之後另外開一個加好友畫面。要先在 Console 把官方帳號連結到 LINE Login channel。如果 Provider 是**認證 Provider**，`normal` 的加好友選項預設就是勾選狀態。登入回應裡的\[20\] `friendship_status_changed` 可以判斷好友狀態有沒有改變。\[18\]
- `email` scope **要先在 Console 送出申請**（Basic settings → OpenID Connect → Apply）。\[18\]\[21\]
- userId **以 Provider 為單位**，不同 Provider 的 userId 不同；使用者沒刪除 LINE 帳號的話就不會變。\[22\]
- 驗證 ID token：後端呼叫 `POST https://api.line.me/oauth2/v2.1/verify`（帶 `id_token`、`client_id`，可以加 `nonce`）。CatSplit 現有的 `verifyLiffToken` 應該同時檢查 `aud`（channel ID）、`exp`，並在發 Firebase custom token 時把 `sub` 當成 uid 的對應鍵。
- Firebase 整合建議：維持「後端驗 LINE ID token → `createCustomToken(uid, {lineUserId})`」的做法，比 Identity Platform 的通用 OIDC Provider 更容易同時支援 LIFF 和 Web。uid 建議用自家產生的 ID，再另外存 `lineUserId → uid` 的對應，方便 P14「獨立帳號、多種登入方式」日後綁定其他登入方式。

### 3.3 Messaging API（核心）
**官方文件**：/en/reference/messaging-api/、/en/docs/messaging-api/receiving-messages/、/pricing/

**Channel access token 比較**
| 類型 | 效期 | 數量限制 | 備註 |
|---|---|---|---|
| 長效（long-lived） | 不過期 | 1 個（重發會讓舊的失效）\[23\] | 最簡單；外洩風險最高 |
| v2.1（JWT assertion） | 自訂，最長 30 天 | 每個 channel 30 個（超過會報錯）\[23\] | 官方推薦；要自管金鑰 |
| 短效（short-lived） | 30 天 | 30 個（超過時從最早的開始失效）\[23\] | 發行 API 限 370 req/s\[24\] |
| Stateless | 15 分鐘 | 無上限\[23\] | **發出後無法撤銷**；適合 serverless 每次重新取得\[25\]\[26\] |

**Webhook**
- 簽章驗證：用 channel secret 對**原始 request body** 做 HMAC-SHA256，再 Base64，然後和 `x-line-signature` 比對。header 名稱大小寫可能改變。官方**不公開來源 IP**，所以只能靠簽章驗證。\[24\]
- 一定要回 200。LINE 可能送來 `events: []` 的空陣列來確認連線。一個 webhook 可能同時包含多個使用者的多個事件。官方建議用非同步方式處理。\[24\]
- 事件類型：`message`（text、image、video、audio、file、location、sticker）、**`messageEdited`（2026-08-12 新增，只在群組觸發，可以回覆；多個編輯事件可能亂序到達，以 timestamp 最大的為準）**、`unsend`、`follow`（含解除封鎖）、`unfollow`（封鎖）、`join`、`leave`、`memberJoined`、`memberLeft`、`postback`、`videoPlayComplete`（只在 1 對 1）、`beacon`、`accountLink`。membership（日本會員訂閱）在台灣是否可用：未確認。\[27\]\[28\]
- 共同欄位：`webhookEventId`（ULID，用來去重）、`deliveryContext.isRedelivery`、`timestamp`（事件發生時間，重送時不變）、`mode`（`standby` 時不會有 reply token，也不該發訊息）。\[24\]\[27\]\[28\]
- **群組來源的 `source.userId` 依官方參考文件只保證出現在 message 事件**，而且只有 iOS 和 Android 版 LINE 的使用者會帶。所以群組裡的\[24\] postback 不能假設一定拿得到 userId，設計時要保守。
- Webhook redelivery：預設關閉，要在 Console 開啟。重送的次數和間隔不公開，**也不保證送達**；重送量暴增時可能被強制關閉。2026-02\[28\] 起重送停止時會寄 email 通知。\[29\]
- 取得使用者傳來的內容：`GET api-data.line.me/v2/bot/message/{id}/content`，另有\[24\] `/content/preview`。內容一段時間後會自動刪除；文字訊息沒辦法事後再取回。\[28\]

**Reply token**：只能用一次，官方建議收到後 **1 分鐘內**使用（超過不保證可用）。如果是重送的事件，原 token 已用過或事件發生已超過 20 分鐘就不能用。\[30\]

**發送方式比較**
| 方式 | 對象 | 計費 | 速率限制 |
|---|---|---|---|
| reply | 觸發事件的聊天室 | **不計** | 2,000 req/s |
| push | 單一 user、group 或 room | 計（依收件人數） | 2,000 req/s |
| multicast | 多個 userId | 計 | 200 req/s\[24\]\[31\] |
| broadcast | 全部好友 | 計 | 60 req/hour |
| narrowcast | 受眾或屬性篩選 | 計 | 60 req/hour |

- **計費規則**：以「送達人數」計算，跟一次請求裡放幾個 message 物件（最多 5 個）無關。例：推 4 個訊息物件到 5 人群組＝5 則。對方已封鎖或 userId 不存在的不計。超過額度會回\[4\] `429 You have reached your monthly limit.`。\[24\]
- 重試與冪等：push 類 API 支援 `X-Line-Retry-Key`（UUID）；同一個 key 已被受理時回 `409`，並在 `X-Line-Accepted-Request-Id` 帶出原本的請求。\[24\]
- 訊息類型：text（含 mention 或 emoji）、sticker、image、video、audio、location、imagemap、template（buttons、confirm、carousel，carousel 欄數上限 10）、Flex。URI\[32\] action 的 `uri` 上限從 1,000 字提高到 **10,000 字（2026-10-27）**，Flex 另有 `altUri.desktop`。\[7\]
- Quick Reply：最多 **13 個**按鈕，1 對 1、群組、多人聊天都能用；**不能放 richmenuswitch**。\[33\]
- Sender 自訂：message 物件可以帶 `sender.name` 和 `sender.iconUrl`（HTTPS、PNG、1:1、1MB 以內）。名稱長度上限未確認。\[30\]
- Loading animation：`POST /v2/bot/chat/loading/start`，`loadingSeconds` 可設 5～60 秒（每 5 秒一級），**只能用在 1 對 1**，限 100 req/s，需要\[24\] LINE 13.16.0 以上。\[30\]\[34\]
- 標示已讀：2025-11-05 起所有人都能用 `markAsReadToken` 呼叫 `POST /v2/bot/chat/markAsRead`。舊版的法人\[5\]\[9\] Mark as read API 會在 2026-10 底停止受理新申請。\[29\]
- 群組相關：同一個群組同一時間只能有 1 個官方帳號。可以取得群組 summary（名稱、圖示）、成員數、單一成員 profile。**取得群組全部成員 userId 的 API 只限認證或 premium 帳號**；一般帳號只能從 message 事件逐步收集 userId。\[35\]\[36\]
- **Rich Menu**：每個官方帳號最多 1,000 個選單、1,000 個別名（alias ID 最多 32 字）。圖片寬 800～2500px、高 250px 以上、寬高比 1.45 以上、1MB 以內。可以設預設選單、綁定個別使用者、批次替換或解除綁定。用 alias 搭配 `richmenuswitch` 可以做出分頁切換效果，切換時會送 postback 事件。速率限制：建立或刪除 100 req/hour；批次控制 **3 req/hour**；取得清單在 **2026-05-26 起降為 10 req/s**。**2026-07-01\[7\]\[24\]\[30\]\[37\] 新增 Rich Menu Insight**（總計或每日的顯示與點擊數）；API\[5\] 建立的選單和 OA Manager 建立的選單，兩邊的統計互相看不到。\[5\]\[7\]
- Insight 與受眾：好友數、好友人口屬性、訊息互動統計、per-unit 統計（自訂彙整單位）等端點多數限 60 req/hour。2026-01-21\[24\] 起可以用 Tracking Tag 網站流量受眾。2025-11-26\[7\] 起 Console 的 Statistics 分頁不再顯示發送數，請改用\[38\] API 查詢。\[38\]
- 和 OA Manager 並用：OA Manager 的自動回應或聊天設定會影響 webhook 行為。開了 webhook 之後，建議把「自動回應」關掉或縮小範圍；手動聊天和 Bot 的切換由 OA Manager 的回應設定控制，詳細 UI 行為本次未重新查證。

**台灣方案價格（2026-11-01 起，未稅）**
| 方案 | 月費 | 每月免費則數 | 加購 |
|---|---|---|---|
| 輕用量 | NT$0 | 200 | 不可 |
| 中用量 | NT$1,000（原 800） | 3,000 | 不可（要升級成高用量）\[39\] |
| 高用量 | NT$1,400（原 1,200） | 6,000 | 1～50,000 則 NT$0.2／則；50,001 則起 NT$0.15／則（累進）\[39\] |
- 歡迎訊息、1 對 1 手動聊天、自動回應都不算群發則數。聊天進階方案（NT$100／月）是另外訂的，不增加則數。\[40\]\[41\]\[42\]\[43\]

### 3.4 官方帳號互動能力
- **加好友**：可以用 Add friend URL 或 QR（`https://line.me/R/ti/p/@uhu2720z`）、LINE Login 的 `bot_prompt`、LIFF 的「加好友選項」（Console 的 LINE Login channel → Add friend option）、`liff.requestFriendship()`。
- **Account Link**：流程是發 link token → 導向帳號連結頁 → 收到 `accountLink` 事件。它的用途是把「LINE 好友」和「自家帳號」綁在一起。**因為 CatSplit 的使用者本來就透過 LIFF 用同一個 Provider 的 userId 登入，只要 Messaging API channel 在同一個 Provider 底下，就不需要 Account Link**，直接用 userId 對應即可。只有在 P14「獨立帳號」使用者從來沒用 LINE 登入時，才考慮用 Account Link 或 LIFF 綁定頁。
- **歡迎訊息**：在 OA Manager 設定，不計費。也可以改由 `follow` 事件的 reply 發送動態歡迎（同樣不計費）。
- **聊天與 Bot 切換**：由 OA Manager 的回應設定控制。台灣的聊天進階方案有 **AI 聊天機器人（β）**。\[44\]
- **LINE VOOM**：沒有找到公開的發文 API（未確認）。
- **LINE 通知訊息**：可以用電話號碼（E.164 格式後做 SHA256）發送，對方不必是好友，日本、泰國、台灣可用，但屬於**法人選項，要申請**，而且用途受\[45\]\[46\] UX 規範限制。CatSplit\[46\]\[47\] 不適用。

### 3.5 LINE Notify 終止與替代
- **已確認**：LINE Notify 在 **2025-03-31 終止**，2025-04-01 起所有 API（notify-api.line.me 等）都無法使用。官方的替代建議是**用官方帳號加 Messaging API 發送**（每月有免費額度）。\[48\]\[49\]
- CatSplit 的替代架構：Messaging API push（使用者要加官方帳號好友）。PNP 通知訊息需要法人申請，不適合。

### 3.6 LINE MINI App
- 和 LIFF 的差異：MINI App 是獨立的 MINI App channel。分成**未驗證**（不需審核即可發布；標頭顯示網域）和**已驗證**（要審核；可用 Home 分頁「服務」、LINE 搜尋、服務通知、Custom Path、Channel consent simplification 等）。**只有認證\[50\]\[51\]\[52\] Provider 底下的 channel 才能申請驗證審核。**\[52\]\[53\]
- 台灣：**2026-03-11 起**，符合 MINI App Policy 的客戶可以建立台灣或泰國的 MINI App channel，並以未驗證 MINI App 發布（政策頁的舊文字仍寫需要核准，\[54\]兩者有出入，以 2026-03 公告較新）。政策列出的申請資格包含台灣統編，或台灣的個人。\[7\]\[55\]
- 服務通知（Service Message）：**只限已驗證 MINI App**。\[52\]只能用在回應使用者操作，禁止廣告與活動通知；每次使用者操作最多送 5 則；notification token 有效 1 年，每個 LIFF access token 只能發 1 個；每個 channel 最多 20 個範本，範本要審核。\[56\]\[57\]
- 2025-10-01 起所有 MINI App 都可以在一般瀏覽器使用，endpoint 必須能在外部瀏覽器運作。\[58\]\[59\]
- 付費：MINI App Policy 規定在 MINI App 內販售付費項目必須使用 IAP，但 **IAP 目前只開放日本**，台灣標示 ❌。\[55\]\[60\]2026-10-14 政策修訂，限縮廣告原則上只能用 LY Ads Network。\[7\]
- **遷移評估**：LINE Login channel 底下的 LIFF app **不能遷移**成 MINI App channel，只能另建。\[22\]CatSplit 目前用不到服務通知以外的 MINI App 專屬功能，而服務通知又要先通過驗證。**建議先不遷移**；等 P19 推播成本成為瓶頸、且具備認證 Provider 條件時再評估。

### 3.7 LINE Pay 與付款
- **LINE Pay Online API v3**（文件已移到 developers-pay.line.me）：主要端點有 `POST /v3/payments/request` → 使用者授權 → `POST /v3/payments/{transactionId}/confirm`；另有 check、capture、void、refund、payments（查詢）。預先核准付款（regKey）適合訂閱扣款。簽章方式是\[61\]\[62\] `X-LINE-Authorization` = Base64(HMAC-SHA256(ChannelSecret, ChannelSecret + URI path + body 或 query + nonce))。Sandbox\[63\] 主機是 `sandbox-api-pay.line.me`。**2025-11\[61\] 新增 Online API v4**（台灣電子支付機構相關規範）。\[64\]
- 日本 LINE Pay 已在 2025-04-30 終止；台灣、泰國持續營運。\[60\]\[65\]
- 台灣商家申請條件（是否必須公司或行號）：**未確認**，要向 LINE Pay 洽詢。
- **個人間轉帳**：**LINE 官方沒有公開的個人間轉帳 API**。LINE Pay API 都是「商家向消費者收款」，不能替分帳成員發起或驗證朋友間的轉帳。CatSplit 只能維持「使用者自行轉帳 → 在 App 內記錄或確認」。
- LINE Bank、街口、悠遊付的公開 deep link 或 QR 規格：**未確認**（本次沒找到官方公開規格），不建議依賴未公開的 scheme。
- LIFF 內付款規範：LIFF（非 MINI App）的專屬付款政策**未確認**；MINI App 則受上述 IAP 規定約束。

### 3.8 分享與連結
- LIFF URL：`https://liff.line.me/{liffId}/{path}?{query}`。附加的路徑和查詢參數會透過 `liff.state` 帶到 secondary redirect（`permanentLinkPattern=concat`）。\[6\]
- 常用 LINE URL scheme（依官方 URL scheme 文件，本次未重新抓取）：加好友 `https://line.me/R/ti/p/@{basicId}`、分享文字 `https://line.me/R/msg/text/?{text}`、開啟與官方帳號的聊天並預填文字 `https://line.me/R/oaMessage/@{basicId}/?{text}`。
- Social Plugins（Share、Add friend 按鈕）：仍屬官方產品，具體規格請以官方文件為準；OG 抓取快取機制與快取清除工具：**未確認**。
- Flex 的 URI action 可以直接開 LIFF URL（建議**分享出去的卡片一律用 URI action**，因為收件聊天室裡未必有 Bot，postback 會無處可送）。
- LINE Things：文件與參考資料已停止提供。Beacon 與分帳無關，略過。

### 3.9 其他工具與 SDK
- **@line/bot-sdk（Node）**：v11 系列，最新 **v11.3.0**（支援 PNP 範本訊息）；v11.2.0 支援 messageEdited；v11.1.0 支援 Rich Menu insight；**v11.0.0 移除已棄用程式碼與 axios 依賴**，需要\[66\] **Node ≥ 22**，同時支援 ESM 與 CJS，並附 TypeScript 型別。舊的\[67\] `line.Client` 已移除，請用 `messagingApi.MessagingApiClient`、`MessagingApiBlobClient`。官方建議從舊版先升到\[68\]\[69\] v10.8.0 再升 v11。CatSplit\[66\] 用 Node 22，正好符合。
- 開發工具：Flex Message Simulator、LIFF CLI（v0.3.0，2025-03）、LIFF Inspector 與 mock、LINE MINI App Playground（2025-02）。**Messaging\[58\] API、LINE Login、MINI App 的官方 demo app 已於 2026-09-30 下架**。LINE\[70\] Bot Designer 的現況未確認。
- Console：Provider、Channel、Roles 管理；webhook URL 的 Verify 按鈕；webhook 錯誤統計。
- 2025–2026 的 AI 相關：台灣 OA 聊天進階方案的 AI 聊天機器人（β）。2026 LINE Developer Conference 宣布支援 AI Agent 的方向（二手報導，細節未確認）。\[71\]
- Open Chat：LIFF 不相容；沒有公開的 Open Chat Bot API（未確認）。

### 3.10 安全與合規
- 簽章驗證：一定要用 raw body（Cloud Functions v2 的 `req.rawBody`），並用定長比較（`crypto.timingSafeEqual`）。
- 機密資料：channel secret、access token、JWT 私鑰都放在 Secret Manager（firebase-functions v6 的 `defineSecret`），只綁定到需要的 function。
- 冪等：webhook 用 `webhookEventId` 搭配 Firestore `create()`（文件已存在就跳過）；push 用 `X-Line-Retry-Key`（可以用通知任務 ID 衍生的 UUID）。
- ID token：驗證 `aud`、`exp`、`nonce`（Web 登入），伺服器只信任後端驗證過的 `sub`。
- 個資：LIFF 官方建議不要把 `getProfile` 或 `getDecodedIDToken` 的資料直接當成可信資料送到伺服器。displayName\[6\] 和 pictureUrl 屬於個資；收到 `unsend` 時應刪除對應資料；`unfollow` 時停止 push 並記錄時間；`leave` 時解除群組綁定。
- 發佈狀態：LINE Login channel 在 Developing 狀態時只有 channel 管理者或測試者能登入，對外要切到 Published（官方文件常見說明，本次未重新查證）。

---

## 4. 對應 CatSplit 的功能路線圖

> 共同規範：Cloud Functions v2、`region: 'asia-east1'`、`maxInstances: 5`（webhook 可以視流量調到 10，但要和現有規範一致）、Node 22、`@line/bot-sdk@^11`。

### P15：LIFF SDK 安全升級與相容性修正（優先度：最高；難度：低；費用：0）
- **前置條件**：無。
- **Console**：不用改。
- **前端**：`package.json` 把 `@line/liff` 鎖到 `2.31.2`（並更新 lockfile）；把 `getLanguage()` 全部換成 `getAppLanguage()`；確認 `liff.init` 完成前沒有任何 router 轉址（react-router 7 的 loader 或 redirect 要等 `liff.ready`）。
- **測試**：外部瀏覽器訪客登入與認領；`liff.state` 深層連結（含 `?` 的參數值）；iOS 和 Android、LINE 內與外；shareTargetPicker、sendMessages。
- **風險**：v2.31.2 的 `?` 處理改變；要確認沒有在參數值裡塞未編碼的 URL。

### P16：Messaging API webhook 基礎（優先度：高；難度：中；費用：0）
- **前置條件**：OA @uhu2720z 啟用 Messaging API，而且**選擇和 LINE Login channel 相同的 Provider**。
- **Console 步驟**：
  1. OA Manager → 設定 → Messaging API → 啟用，選擇現有 Provider。
  2. Developers Console → 該 Messaging API channel → 取得 Channel secret；發行 token（MVP 先用長效 token，之後改 v2.1 或 stateless）。
  3. Webhook URL 填 `https://asia-east1-<project>.cloudfunctions.net/lineWebhook` → Verify → 開啟 Use webhook 與 Webhook redelivery。
  4. 「Allow bot to join group chats」開啟（給 P17 用）。
  5. OA Manager 的回應設定：開 Webhook，關掉或縮小自動回應。
- **Secrets**：`LINE_MSG_CHANNEL_SECRET`、`LINE_MSG_CHANNEL_ACCESS_TOKEN`（之後改成 `LINE_MSG_CHANNEL_ID` 加 `LINE_MSG_JWT_PRIVATE_KEY`、`LINE_MSG_JWT_KID`）。
- **Functions**：`lineWebhook`（onRequest）、`lineProcessEvent`（onDocumentCreated `lineWebhookEvents/{eventId}`）。
- **Firestore**：
  - `lineWebhookEvents/{webhookEventId}`：`{type, source, payload, receivedAt, processedAt, status}`，設 TTL 30 天。
  - `lineUsers/{lineUserId}`：`{uid, isFriend, followedAt, unfollowedAt, richMenu}`。
  - security rules：`line*` 集合一律 `allow read, write: if false`（只允許 Admin SDK 存取）。
- **測試**：用錯誤簽章應回 401；空 events 回 200；重送事件不重複處理；follow、unfollow 正確更新 `isFriend`。

### P17：群組 Bot 與群組綁定、群組內查詢與記帳（優先度：高；難度：中高；費用：reply 為 0）
- **流程設計**：
  1. 使用者把 Bot 拉進 LINE 群組 → 收到 `join` 事件 → 以 **reply** 送出歡迎 Flex，附上「綁定 CatSplit 群組」按鈕（URI 指向 `https://liff.line.me/{liffId}/bind?code={一次性綁定碼}`）。
  2. 綁定碼存在 `lineGroupBindCodes/{code}`，內容為 `{lineGroupId, expiresAt(10 分鐘), usedAt}`。之所以要這樣做，是因為 **LIFF 的 getContext 已經拿不到 groupId**，只能從 webhook 端產生綁定碼。
  3. LIFF 綁定頁讓使用者選擇自己擁有權限的 CatSplit 群組 → callable `lineBindGroup` 驗證碼與權限 → 寫入 `lineGroups/{lineGroupId}.catsplitGroupId` 和 `groups/{gid}.lineGroupId`。
- **指令**（用 reply，免費）：「結算」「餘額」「@小明 欠多少」回傳 Flex 結算卡；「午餐 300 @小明 @小華」用 mention 的 `mentionees[].userId` 對應成員，比用顯示名稱比對可靠。解析成功後回一張「確認新增」卡，按鈕用 URI 開 LIFF 確認頁，避免群組 postback 拿不到 userId 的問題。
- **messageEdited 和 unsend**：如果記帳是由某則訊息觸發，收到編輯事件時以 timestamp 最新的為準來更新草稿；收到收回事件時刪除未確認的草稿。
- **leave 和 memberLeft**：解除綁定，或標記成員已離開。
- **新 Functions**：`lineBindGroup`（onCall）、在 `lineProcessEvent` 內新增 `handlers/group.ts`、`handlers/command.ts`。
- **Firestore**：`lineGroups/{lineGroupId}`、`lineGroupBindCodes/{code}`；`groups/{gid}.members[].lineUserId`。
- **限制**：一般帳號不能列出所有群組成員 userId（只限認證或 premium），所以要靠成員第一次發言或在 LIFF 登入時逐步對應。\[35\]
- **測試**：群組綁定碼過期與重複使用；非群組成員誤綁；1 分鐘內一定要 reply（heavy 計算先回 Loading 不可用，因為 Loading 只限 1 對 1）。

### P18：Rich Menu（優先度：高；難度：中；費用：0）
- **設計**：
  - 預設選單「未綁定」：開啟 CatSplit、加入群組教學、綁定帳號。
  - per-user 選單「已綁定」，兩個分頁用 alias 加 `richmenuswitch` 切換：分頁 A 是「新增支出、結算、我的餘額」，分頁 B 是「儲蓄目標、預算、設定」。各按鈕用 URI 指向 `https://liff.line.me/{liffId}/expense/new`、`/settle`、`/savings` 等。
- **Functions**：`lineRichMenuDeploy`（管理者手動執行的 onCall 或 script，用來建立、上傳圖片、設定 alias）；P16 的 follow 或 LIFF 登入完成後呼叫 link per-user（每次登入不要重複呼叫，以 `lineUsers.richMenu` 狀態判斷）。
- **注意**：建立與刪除選單有 100/hour 的限制；批次控制只有 3/hour。圖片規格見\[24\] §3.3。統計用 Rich Menu Insight API（60\[5\] req/hour）。\[24\]
- **測試**：新好友拿到預設選單；LIFF 登入後切換成已綁定；封鎖再解除後選單仍正確。

### P19：可訂閱的提醒通知（優先度：中高；難度：中；費用：有）
- **類型**：結算提醒、未還款提醒、預算 80% 與 100%、重複性支出到期、儲蓄目標達成。
- **架構**：`lineNotifyScheduler`（onSchedule，例如每天 20:00 Asia/Taipei）掃描 → 把任務寫入 `notificationJobs/{jobId}` → `lineNotifyWorker`（onDocumentCreated 或 Cloud Tasks `onTaskDispatched`）做 push，並帶 `X-Line-Retry-Key = uuidv5(jobId)`。
- **成本守門**：
  - 每月先呼叫 `GET /v2/bot/message/quota` 和 `/quota/consumption`，存到 `lineQuota/{yyyymm}`，到 80% 時改成只送高優先通知。
  - 同一位使用者一天合併成 1 則「摘要 Flex」。
  - 預設關閉，由使用者 opt-in。
  - 只推給 `isFriend=true` 的使用者。
  - 群組提醒建議改成「在群組內有人發言時順便 reply」，或只推 1 則給債權人；推到群組會依群組人數計費。
- **Firestore**：`users/{uid}.notifyPrefs = {settleReminder, debtReminder, budget, recurring, savings, quietHours}`（使用者本人可讀寫）；`notificationLog/{id}`（只限伺服器）。
- **前端**：設定頁加上通知開關，並說明「需加官方帳號好友」，同時用 `requestFriendship({template})` 引導加好友。

### P20：分享體驗強化（優先度：中；難度：低；費用：0）
- 每筆支出、結算、邀請都用 Flex 分享：在 LIFF 內用 `sendMessages`（當前聊天室），其他情況用 `shareTargetPicker({isMultiple:true})`。卡片按鈕一律用 URI 開 LIFF（例如「確認已轉帳」開 `/transfer/{id}/confirm`），由 LIFF 端驗證 ID token 後寫入。
- 邀請連結：`https://liff.line.me/{liffId}/join?g={gid}&inv={token}&src=share`，`src` 和 `inv` 用於歸因。
- 測試：參數值不要含未編碼的 `?`（v2.31.2 的行為差異）。

### P21：帳號對應與 P14 獨立帳號（優先度：中；難度：中）
- 資料模型：`users/{uid}`（uid 由 CatSplit 產生）＋ `authLinks/{provider:subject}` → uid（例如 `line:Uxxxx`、`google:xxx`）。LINE webhook 端用 `lineUsers/{lineUserId}.uid` 反查。
- 只有在「沒有用 LINE 登入過的獨立帳號」想收 LINE 通知時，才提供 LIFF 綁定頁（相當於自製的 Account Link）；不需要使用官方的 Account Link API。

### P22：LIFF 能力玩法（優先度：中低）
- `scanCodeV2`：掃描朋友的收款 QR（只解析並顯示，不發起付款）、掃描發票 QR 帶入金額與日期（台灣電子發票 QR 欄位格式要另外查財政部規格，未確認）。
- `createShortcutOnHomeScreen`：在「常用群組」頁提供「加到主畫面」。
- 用 `permanentLink.createUrl()` 產生當前頁的分享連結。
- 視窗尺寸：維持 Full（requestFriendship 只能在 Full 使用）。

### P23：收款碼與連結（優先度：中低）
- 只做「儲存並展示」：使用者上傳自己的收款 QR 圖片或連結（街口、LINE Pay、銀行帳號）存到 Storage，結算時在 Flex 或 LIFF 展示。**不做付款發起**，因為沒有公開 API 可用。
- 訂閱或付費（P6）：LINE 端沒有台灣可用的 LIFF 或 MINI App 內購；如果要收費，建議用外部金流（在 LIFF 內用 `openWindow({external:true})` 開啟網頁結帳）。這部分是否符合 LIFF 規範：未確認，上線前請人工向 LINE 確認。

### 創意玩法（花式玩 LINE API）
- **貓咪 sender**：所有 Bot 回覆都用 `sender: {name:'貓咪會計', iconUrl}`，結算時換成「貓咪法官」，催款時換成「討債喵」。
- **Quick Reply 快速記帳**：1 對 1 輸入「300」後，Bot 用 reply 帶出最多 13 個 Quick Reply，例如分類（餐飲、交通…）、最近群組、`datetimepicker`（選日期）。
- **Loading animation**：1 對 1 查詢跨幣別結算時，先送 loading 5～10 秒再 reply。
- **貼圖訊息**：結清時回一張慶祝貼圖（sticker message）。
- **互動式結算卡**：群組 Flex carousel，每個轉帳一欄（最多 10 欄 template 或 Flex carousel），按鈕用 URI 開 LIFF「標記已轉帳」，完成後 Bot 在下次互動時 reply 更新後的卡片。
- **Rich Menu 分頁**：用 alias 做「記帳／結算／儲蓄」三分頁，切換時的 postback 可以順便記錄使用偏好。
- **群組編輯事件**：在群組裡修改「午餐 300」→「午餐 320」，Bot 自動更新草稿金額（messageEdited）。

---

## 5. Webhook 架構建議

```
functions/src/line/
  config.ts          // defineSecret；MessagingApiClient 延遲初始化
  webhook.ts         // export const lineWebhook = onRequest({region, maxInstances, secrets}, ...)
  verify.ts          // validateSignature(req.rawBody, secret, header) + timingSafeEqual
  ingest.ts          // 每個 event → lineWebhookEvents/{webhookEventId}.create()（重複就跳過）
  dispatch.ts        // switch(event.type) → handlers/*
  handlers/
    follow.ts unfollow.ts join.ts leave.ts memberJoined.ts memberLeft.ts
    message.ts messageEdited.ts unsend.ts postback.ts
  commands/          // 文字指令解析（記帳、結算、餘額）
  flex/              // Flex 產生器（與前端共用 schema 可放 shared/）
  push.ts            // pushWithRetryKey()；quota 檢查
  richmenu.ts
```
- **時序**：先驗簽（失敗回 401）→ 對 `mode==='standby'` 的事件只記錄 → **需要 reply 的輕量事件（指令、join、follow）直接在請求內處理並 reply**（reply token 要在 1 分鐘內使用；Cloud Functions 回應之後 CPU 可能被節流，所以不要在 `res.send` 之後還做事）→ 重度工作（大量查詢、外部呼叫）寫入 Firestore，由觸發器處理並改用 push（計費）或延後到使用者下次互動時 reply → 最後回 200。
- **冪等**：用 `webhookEventId` 做文件 ID；處理完成標記 `processedAt`；重送（`isRedelivery`）時，如果已處理就直接 200。
- **reply 與 push 的選擇準則**：能 reply 就 reply（免費）；只有在「使用者沒有觸發事件」或「超過 1 分鐘」時才 push，而且 push 前一定要檢查 opt-in、好友狀態和額度。
- **錯誤處理**：LINE API 回 429 時用指數退避；push 一定帶 retry key；收到 `409` 視為成功。

---

## 6. 費用試算（台灣 2026-11-01 新制，未稅，只計 push 類；reply 為 0）

假設每則通知都是 1 對 1 push、收件人都是好友、沒有封鎖。

| 使用者數 × 每月每人 N 則 | 月則數 | 建議方案 | 月費估算 |
|---|---|---|---|
| 100 × 2 | 200 | 輕用量 | NT$0 |
| 100 × 5 | 500 | 中用量 | NT$1,000 |
| 1,000 × 3 | 3,000 | 中用量 | NT$1,000 |
| 1,000 × 5 | 5,000 | 高用量 | NT$1,400 |
| 10,000 × 3 | 30,000 | 高用量 | 1,400 + 24,000×0.2 = **NT$6,200** |
| 10,000 × 5 | 50,000 | 高用量 | 1,400 + 44,000×0.2 = **NT$10,200** |
| 10,000 × 10 | 100,000 | 高用量 | 1,400 + 50,000×0.2 + 44,000×0.15 = **NT$18,000** |

**降低成本的做法**
1. 互動式功能（查結算、記帳、群組指令）全部用 **reply**。
2. 分享類內容由使用者透過 LIFF `sendMessages` 或 `shareTargetPicker` 發送（依推論不計入官方帳號額度）。
3. 一天一則摘要；預設關閉、讓使用者 opt-in；只推給好友狀態的使用者。
4. 群組提醒避免用 push 推到群組（6 人群組＝6 則），改成只推給相關的 1～2 人。\[22\]
5. App 內通知中心，或 Web Push 當作免費的備援管道。
6. 每月追蹤 quota API，在 80% 時降級成只送高優先通知。

---

## 7. 官方 changelog 重點時間線（2024–2026）與棄用清單

| 日期 | 事件 |
|---|---|
| 2024-07-23 | LIFF v2.24.0：新增 `getAppLanguage()`，`getLanguage()` 棄用\[6\] |
| 2024-10 | Messaging API 可以辨識使用者對 Bot 的 mention |
| 2025-03-04 | 台灣 OA 聊天進階方案上線（NT$100／月）\[72\]\[73\] |
| 2025-03-19 | LIFF CLI v0.3.0 |
| 2025-03-26 | 受眾公開與私有設定功能停止 |
| 2025-03-31 | **LINE Notify 終止**\[38\] |
| 2025-04-23 | multicast 速率限制變更 |
| 2025-04-30 | 日本 LINE Pay 終止；developers.line.biz 移除 LINE Pay 文件\[74\] |
| 2025-06-25 | 新建 OA 需要連結 Business Manager（日本為主；台灣是否適用未確認） |
| 2025-10-01 | 所有 MINI App 都能在一般瀏覽器使用\[58\] |
| 2025-11-05 | 所有人都能用 Mark messages as read\[5\] |
| 2025-11 | LINE Pay Online/Offline API v4（台灣電支）\[64\] |
| 2025-11-26 | Console 的 Statistics 分頁不再顯示發送數 |
| 2025-12-09 | 停止公開 LIFF 與 LINE Login roadmap |
| 2026-01-21 | Messaging API 支援 Tracking Tag 網站流量受眾 |
| 2026-03-11 | 台灣與泰國開放建立 MINI App channel（未驗證可直接發布） |
| 2026-03-24 | LIFF v2.28.0：`liff.requestFriendship()`\[7\]\[13\] |
| 2026-05-26 | Get rich menu list 速率限制降為 10 req/s\[7\]\[75\] |
| 2026-07-01 | Rich Menu Insight API |
| 2026-08-12 | 群組 `messageEdited` 事件\[76\] |
| 2026-08-17 | LIFF v2.30.0（requestFriendship template、MINI App 多帳號參數） |
| 2026-09-01／09-30 | 公告台灣 OA 價格調整（LINE Biz-Solutions 專欄標示 2026-09-01，LINE Developers News 標示 2026-09-30） |
| 2026-09-30 | **LIFF v2.31.1 修補 XSS；v2.20.0～2.31.0 棄用**；官方 demo app 下架 |
| 2026-10-07 | LIFF v2.31.2（`?` 參數處理變更） |
| 2026-10-14 | MINI App Policy 修訂（廣告規範） |
| 2026-10-20 | 公布 CVE-2026-112148（GHSA-wppr-qmp4-w627），預告約 2026-11-24 限制舊版 |
| 2026-10-27 | URI action 上限調為 10,000 字 |
| 2026-10 底 | 舊版法人 Mark as read API 停止受理新申請 |
| 2026-11-01 | **台灣 OA 新價格生效**\[77\] |

**已棄用請勿使用**
- LINE Notify（全部）
- LIFF SDK v2.20.0～v2.31.0（包含 CatSplit 目前的 2.28.x）
- `liff.getLanguage()`
- `liff.scanCode()`（建議改用 `scanCodeV2`）
- `getContext().groupId/roomId/utouId`（已停止提供）
- `liff.addToHomeScreen`
- LINE Things、Bluetooth plugin
- `@line/bot-sdk` 舊 `Client` 類別（v11 已移除）
- 舊版法人 Mark as read API
- MINI App「Redirect non-LINE users to a web browser」功能\[58\]
- 日本 LINE Pay

---

## 8. 開放問題與需要人工完成的步驟

**需要你手動完成**
1. 在 Developers Console 確認現有 LINE Login channel 所屬的 Provider，並在 OA Manager 啟用 Messaging API 時**選擇同一個 Provider**（官方帳號一旦綁定 Provider，通常無法變更，請操作前再確認）。
2. 取得 Messaging API 的 Channel secret 並發行 token → `firebase functions:secrets:set`。
3. 設定 Webhook URL → Verify → 開啟 Use webhook、Webhook redelivery、Allow bot to join group chats。
4. OA Manager 回應設定：關閉或調整自動回應；設定歡迎訊息；確認 OA 方案（建議先用輕用量，P19 上線前再評估中用量）。
5. LINE Login channel：設定 Add friend option（normal 或 aggressive），並確認 Linked OA 是 @uhu2720z；確認 channel 是 Published。
6. LIFF：確認 Scan QR、shareTargetPicker 已開啟，尺寸為 Full。
7. 製作 Rich Menu 圖片（2500×1686 或 2500×843 等，符合 §3.3 規格）。
8. 如果要申請 `email` scope：在 OpenID Connect 送出申請。

**開放問題（未確認，需要洽詢 LINE 或再查）**
- LIFF（非 MINI App）內導向外部金流的政策細節。
- LINE Pay 台灣商家的個人或行號申請資格。
- 街口、悠遊付、LINE Bank 的公開 deep link 規格。
- `sender.name` 長度上限；群組成員 ID API 每頁筆數。
- LINE 對 OG 的快取時間與清除工具。
- Business Manager 連結要求是否適用台灣。
- OA 認證（取得群組成員列表的前提）的台灣申請條件。

---

## 9. 來源說明
本報告以 LINE Developers 官方文件、官方 News、LIFF Release notes、Messaging API reference、LINE Biz-Solutions 台灣官方專欄、LINE Pay Developers，以及 line-bot-sdk-nodejs 官方 GitHub 為主要依據。各節內文已標出官方文件路徑（developers.line.biz/en/…），方便實作時直接查閱。標示「未確認」或「本次未重新查證」的項目，實作前請再核對官方最新文件。

## 資料來源

1. [Getting started with LINE Login](https://developers.line.biz/en/docs/line-login/getting-started/)
2. [LINE Platform glossary](https://developers.line.biz/en/glossary/)
3. [How message counts are calculated in the Messaging API](https://developers.line.biz/en/tips/2026/05/28/how-to-count-messages/)
4. [Messaging API pricing](https://developers.line.biz/en/docs/messaging-api/pricing/)
5. [News: # LINE Official Account](https://developers.line.biz/en/news/tags/line-official-account/1/)
6. [LIFF API reference](https://developers.line.biz/en/reference/liff/)
7. [News: Articles for 2026](https://developers.line.biz/en/news/2026/)
8. [Release notes](https://developers.line.biz/en/docs/liff/release-notes/)
9. [News: \[Updated\] LIFF v2.27.1 released](https://developers.line.biz/en/news/2025/07/24/release-liff-2-27-1/)
10. [News: LIFF CLI v0.3.0 released](https://developers.line.biz/en/news/2025/03/19/liff-cli-0-3-0/)
11. [Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/)
12. [developers.line.biz](https://developers.line.biz/en/docs/liff/developing-liff-apps/index.html.md)
13. [Use the liff.requestFriendship() method to naturally prompt users to add your LINE Official Account as a friend or unblock it](https://developers.line.biz/en/tips/2026/05/21/line-request-friendship/)
14. [developers.line.biz](https://developers.line.biz/ja/tips/2026/09/03/liff-request-friendship/_payload.json)
15. [developers.line.biz](https://developers.line.biz/en/tips/2026/09/03/liff-request-friendship/_payload.json)
16. [developers.line.biz](https://developers.line.biz/en/docs/liff/overview/index.html.md)
17. [LINE Front-end Framework (LIFF)](https://developers.line.biz/en/docs/liff/overview)
18. [Integrating LINE Login with your web app](https://developers.line.biz/en/docs/line-login/integrate-line-login/)
19. [PKCE support for LINE Login](https://developers.line.biz/en/docs/line-login/integrate-pkce/)
20. [Add a LINE Official Account as a friend when logged in (add friend option)](https://developers.line.biz/en/docs/line-login/link-a-bot/)
21. [Auth.js](https://authjs.dev/reference/core/providers/line)
22. [FAQ](https://developers.line.biz/en/faq/)
23. [Points to check when using the Messaging API from multiple tools with a single LINE Official Account](https://developers.line.biz/en/tips/2026/07/23/using-multiple-api-tools/)
24. <https://developers.line.biz/en/reference/messaging-api/index.html.md>
25. [developers.line.biz](https://developers.line.biz/en/docs/basics/channel-access-token/index.html.md)
26. [LINE Messaging API: how it works and how to connect 2026](https://sleekflow.io/en-us/blog/line-messaging-api)
27. [Guide to LINE Webhooks: Features and Best Practices](https://hookdeck.com/webhooks/platforms/guide-to-line-webhooks-features-and-best-practices)
28. [Receive messages (webhook)](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
29. [Notice for corporate customers](https://developers.line.biz/en/docs/partner-docs/notice/)
30. [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/)
31. [Every LINE Messaging API limit, in one table](https://www.conferbot.com/limits/line)
32. [News: # Template message - LINE Developers](https://developers.line.biz/en/news/tags/template-messages/1/)
33. [Use quick replies](https://developers.line.biz/en/docs/messaging-api/using-quick-reply/)
34. [Display a loading animation](https://developers.line.biz/en/docs/messaging-api/use-loading-indicator/)
35. [Get user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)
36. [developers.line.biz](https://developers.line.biz/en/docs/messaging-api/group-chats/index.html.md)
37. [Play with rich menus](https://developers.line.biz/en/docs/messaging-api/try-rich-menu/)
38. [News: # End of life - LINE Developers](https://developers.line.biz/en/news/tags/end-of-life/1/)
39. [2026年 LINE 官方帳號方案價格調整｜LINE Biz-Solutions](https://tw.linebiz.com/column/LINEOA-2026-Price-Plan/)
40. [LINE 官方帳號費用怎麼算？2026 年 11 月新制月費、訊息費與 LINE Bot 費用一次看懂](https://www.wishmobile.com/blogs/crm/LINE_OA_pricing)
41. [2026 LINE 官方帳號（LINE OA）價格方案總整理：一篇搞懂收費標準、費用計算與選擇指南](https://www.anyong.com.tw/37452)
42. [LINE 官方帳號 2026 費用怎麼算？什麼時候該把對話分流](https://www.omago.ai/zh-tw/blog/line-official-account-costs-taiwan)
43. [官方 LINE 付費方案怎麼選？一次看懂帳號費用額度與省錢方法](https://ftdesign.tw/how-to-choose-the-official-line-payment-plan-understand-fee/)
44. [LINE官方帳號聊天進階方案： 一對一聊天功能撇步報你知](https://tw.linebiz.com/column/1on1-chat/)
45. [LINE notification messages API reference](https://developers.line.biz/en/reference/line-notification-messages/)
46. [LINE notification messages overview](https://developers.line.biz/en/docs/partner-docs/line-notification-messages/overview/)
47. [line notification messages](https://developers.line.biz/ja/reference/line-notification-messages)
48. [News: Articles for 2025](https://developers.line.biz/en/news/2025/)
49. [News: Articles for 2024](https://developers.line.biz/en/news/2024/?month=10&day=07&article=line-notify-will-be-discontinued)
50. [LINE Mini Apps(2): Publish Your Mini App and Connect with Users.](https://medium.com/@mizutori/line-mini-apps-2-publish-your-mini-app-and-connect-with-users-3721244c1f25)
51. [Introducing LINE MINI App](https://developers.line.biz/en/docs/line-mini-app/discover/introduction/)
52. [Custom features](https://developers.line.biz/en/docs/line-mini-app/discover/custom-features/)
53. [Submitting LINE MINI App - LINE Developers - line.biz](https://developers.line.biz/en/docs/line-mini-app/submit/submission-guide/)
54. [LINE MINI App Policy](https://terms2.line.me/LINE_MINI_App?lang=en%2F)
55. [LINE MINI App Policy](https://developers.line.biz/en/docs/line-mini-app/submit/line-mini-app-policy/)
56. [LINE MINI App API reference](https://developers.line.biz/en/reference/line-mini-app/)
57. <https://developers.line.biz/en/docs/line-mini-app/develop/service-messages/index.html.md>
58. [News: LINE MINI App Playground released](https://developers.line.biz/en/news/2025/02/03/line-mini-app-playground/)
59. [Open a LINE MINI App in an external browser](https://developers.line.biz/en/docs/line-mini-app/develop/external-browser/)
60. [Handling payments](https://developers.line.biz/en/docs/line-mini-app/develop/payment/)
61. [Online API v3](https://developers-pay.line.me/online-api-v3)
62. [line pay sdk](https://packagist.org/packages/yidas/line-pay-sdk)
63. [LINE Pay - New Features of LINE Pay - Speaker Deck](https://speakerdeck.com/line_developers_tw/line-pay-new-features-of-line-pay)
64. [API change log](https://developers-pay.line.me/api-change-log)
65. [“LINE Pay” services in Japan will be terminated by April 30, 2025](https://medium.com/tokyo-fintech/line-pay-services-in-japan-will-be-terminated-by-april-30-2025-33bc03ac8242)
66. [Releases · line/line-bot-sdk-nodejs](https://github.com/line/line-bot-sdk-nodejs/releases)
67. [@line/bot-sdk](https://npm.io/package/@line/bot-sdk)
68. [Client](https://line.github.io/line-bot-sdk-nodejs/guide/client.html)
69. [LINE Messaging API SDK 大改版 - Richard Lee](https://dlackty.com/line-messaging-api-sdk-revamped)
70. [News: Articles for # Messaging API - LINE Developers](https://developers.line.biz/en/news/tags/messaging-api/)
71. [LINE เตรียมแพลตฟอร์มรองรับ AI Agent พร้อมแผนเพิ่มช่องทางรายได้ให้ LINE MINI App](https://www.telecomlover.com/2026/10/22/line-developer-conference-2026-ai-agent-mini-app/)
72. [LINE官方帳號 聊天進階方案-即將上線!!](https://www.cacafly.com/post/line%E5%AE%98%E6%96%B9%E5%B8%B3%E8%99%9F-%E8%81%8A%E5%A4%A9%E9%80%B2%E9%9A%8E%E6%96%B9%E6%A1%88-%E5%8D%B3%E5%B0%87%E4%B8%8A%E7%B7%9A)
73. [【LINE 收費】LINE 官方帳號聊天進階方案懶人包！每月100元](https://kikinote.net/163412)
74. [News: Due to the LINE Pay service termination in Japan, we've discontinued providing LINE Pay documentation and references](https://developers.line.biz/en/reference/line-pay/)
75. [News](https://developers.line.biz/en/news/4/)
76. [News: # Messaging API - LINE Developers](https://developers.line.biz/en/news/tags/messaging-api/1/)
77. [News: Messaging API, LINE Login, and LINE MINI App demo apps will be discontinued](https://developers.line.biz/en/docs/line-mini-app/demo/maas-demo/)
